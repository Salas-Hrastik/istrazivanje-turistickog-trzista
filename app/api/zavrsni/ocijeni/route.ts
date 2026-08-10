import { NextRequest, NextResponse } from 'next/server';
import { zahtijevajKorisnika } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { retrieve, dovoljnoKonteksta, toCitations } from '@/lib/retrieval';
import { buildZavrsniOcjenaSystemPrompt } from '@/lib/prompt';
import { askClaudeJson } from '@/lib/claude';
import { mjeri, zabiljezi } from '@/lib/telemetrija';
import { odgovorNaGresku } from '@/lib/greske';

export const runtime = 'nodejs';
export const maxDuration = 60;

export type Ocjena = 'dobro' | 'djelomicno' | 'slabo';

const SHEMA = {
  type: 'object',
  properties: {
    ocjena: { type: 'string', enum: ['dobro', 'djelomicno', 'slabo'] },
    reakcija: { type: 'string' },
    potpitanje: { type: 'string' },
    pokrio: { type: 'array', items: { type: 'string' } },
    izostalo: { type: 'array', items: { type: 'string' } },
  },
  required: ['ocjena', 'reakcija'],
} as const;

/**
 * POST /api/zavrsni/ocijeni
 *   { poglavljeBroj, pitanje, kljucneTocke, transkript, potpitanjeVec }
 *
 * Procjenjuje jedan izgovoreni odgovor na završnoj usmenoj provjeri i odlučuje
 * hoće li postaviti kontekstualno POTPITANJE. Potpitanje se nudi najviše jednom
 * po pitanju (`potpitanjeVec`) — inače bi student koji ne zna mogao ostati
 * zaglavljen na istoj temi do kraja ispita.
 *
 * PRIVATNOST: ovamo dolazi samo tekstualni transkript. Snimka nikad ne napušta
 * /api/transkript, gdje se obrađuje u memoriji i odbacuje.
 */
async function POSTImpl(request: NextRequest) {
  const auth = await zahtijevajKorisnika();
  if (!auth.ok) return NextResponse.json({ greska: auth.poruka }, { status: 401 });

  const body = await request.json();
  const poglavljeBroj: number | undefined = body?.poglavljeBroj || undefined;
  const pitanje: string = (body?.pitanje || '').trim();
  const transkript: string = (body?.transkript || '').trim();
  const kljucneTocke: string[] = Array.isArray(body?.kljucneTocke) ? body.kljucneTocke : [];
  const potpitanjeVec: boolean = body?.potpitanjeVec === true;

  if (!pitanje || !transkript) {
    return NextResponse.json({ greska: 'Nedostaje pitanje ili odgovor.' }, { status: 400 });
  }

  const admin = supabaseAdmin();
  let poglavljeId: string | undefined;
  if (poglavljeBroj) {
    const { data } = await admin.from('poglavlja').select('id').eq('broj', poglavljeBroj).single();
    poglavljeId = data?.id;
  }

  const kraj = mjeri();
  // Dohvat vodi pitanje; transkript je samo pomoćni signal i skraćen je, da
  // studentove vlastite formulacije ne odvuku dohvat s teme.
  const chunks = await retrieve(`${pitanje}\n${transkript.slice(0, 400)}`, {
    poglavljeId,
    topK: 8,
  });

  if (!dovoljnoKonteksta(chunks)) {
    await zabiljezi({
      vrsta: 'zavrsni_ocjena',
      poglavljeId,
      imaKontekst: false,
      brojIsjecaka: chunks.length,
      trajanjeMs: kraj(),
    });
    // Provjera se ne prekida zbog slabog dohvata: pitanje se zatvara neutralno.
    return NextResponse.json({
      ocjena: 'djelomicno' as Ocjena,
      reakcija: 'Zabilježio sam vaš odgovor. Idemo dalje na sljedeće pitanje.',
      potpitanje: '',
      pokrio: [],
      izostalo: [],
      citati: [],
    });
  }

  const rez = await askClaudeJson<{
    ocjena?: Ocjena;
    reakcija?: string;
    potpitanje?: string;
    pokrio?: string[];
    izostalo?: string[];
  }>(
    buildZavrsniOcjenaSystemPrompt(!potpitanjeVec),
    `PITANJE: ${pitanje}

KLJUČNE TOČKE POTPUNOG ODGOVORA:
${kljucneTocke.length ? kljucneTocke.map((t) => `- ${t}`).join('\n') : '(nisu zadane)'}

STUDENTOV ODGOVOR (transkript govora):
${transkript}

<izvori>
${chunks
  .map(
    (c) =>
      `<izvor odjeljak="${c.naslovOdjeljka}" stranice="${c.stranicaOd}-${c.stranicaDo}">\n${c.text}\n</izvor>`,
  )
  .join('\n\n')}
</izvori>`,
    900,
    undefined,
    SHEMA,
  );

  const ocjena: Ocjena = ['dobro', 'djelomicno', 'slabo'].includes(rez.ocjena ?? '')
    ? (rez.ocjena as Ocjena)
    : 'djelomicno';

  await zabiljezi({
    vrsta: 'zavrsni_ocjena',
    poglavljeId,
    imaKontekst: true,
    brojIsjecaka: chunks.length,
    najboljiScore: chunks[0]?.score ?? null,
    trajanjeMs: kraj(),
  });

  return NextResponse.json({
    ocjena,
    reakcija: (rez.reakcija ?? '').trim() || 'Hvala na odgovoru.',
    // Model unatoč uputi zna vratiti potpitanje i kad ga ne smije; brana je ovdje.
    potpitanje: potpitanjeVec ? '' : (rez.potpitanje ?? '').trim(),
    pokrio: Array.isArray(rez.pokrio) ? rez.pokrio : [],
    izostalo: Array.isArray(rez.izostalo) ? rez.izostalo : [],
    citati: toCitations(chunks).slice(0, 3),
  });
}

export async function POST(request: NextRequest) {
  try {
    return await POSTImpl(request);
  } catch (e) {
    return odgovorNaGresku(e, 'Procjena odgovora trenutačno nije dostupna.');
  }
}
