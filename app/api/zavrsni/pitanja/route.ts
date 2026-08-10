import { NextResponse } from 'next/server';
import { zahtijevajKorisnika } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { retrieve, dovoljnoKonteksta, toCitations } from '@/lib/retrieval';
import { buildZavrsniPitanjeSystemPrompt } from '@/lib/prompt';
import { askClaudeJson } from '@/lib/claude';
import { mjeri, zabiljezi } from '@/lib/telemetrija';
import { odgovorNaGresku } from '@/lib/greske';

/** Pet dohvata i pet generiranja premašuju Vercelovu zadanu granicu od 10 s. */
export const runtime = 'nodejs';
export const maxDuration = 120;

/** Koliko pitanja nosi završna provjera. */
const PITANJA = 5;
/** Nastavne cjeline; osma su Dodaci i nisu gradivo. */
const ZADNJA_NASTAVNA = 7;

export interface ZavrsnoPitanje {
  redni: number;
  poglavljeBroj: number;
  opseg: string;
  pitanje: string;
  kljucneTocke: string[];
  citati: { poglavlje: string; stranice: string }[];
}

interface Cjelina {
  id: string;
  broj: number;
  naslov: string;
}

function promijesaj<T>(niz: T[]): T[] {
  const k = [...niz];
  for (let i = k.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [k[i], k[j]] = [k[j], k[i]];
  }
  return k;
}

/**
 * Odjeljci koji nisu gradivo: aparat poglavlja i njegove vježbe. Iz njih se ne
 * ispituje — pitanje iz popisa literature besmisleno je, a iz interaktivne
 * provjere bi samo ponovilo pitanje iz kviza. Mjereno na priručniku, takvih je
 * pet od trinaest odjeljaka po poglavlju, pa bi nasumičan izbor u njih upadao
 * pretjerano često i cjelina bi ostajala bez pitanja.
 */
const NIJE_GRADIVO =
  /^(uvod|ključni pojmovi|ishodi učenja|preporučeno daljnje čitanje|literatura|interaktivna provjera znanja|praktični zadatak)/i;

/**
 * GET /api/zavrsni/pitanja
 *
 * Priprema pet pitanja za završnu usmenu provjeru — svako iz DRUGE nastavne
 * cjeline, odabrane nasumično, i svako vezano uz nasumičan odjeljak te cjeline.
 * Tako dvije uzastopne provjere ne postavljaju isti niz pitanja, a ispit ipak
 * pokriva širinu kolegija umjesto da se nagomila na jednoj temi.
 *
 * Pitanja se generiraju iz isječaka priručnika, ne uzimaju se iz banke kviza:
 * kviz nudi odgovore na izbor, a usmeni traži objašnjenje svojim riječima.
 */
async function GETImpl() {
  const auth = await zahtijevajKorisnika();
  if (!auth.ok) return NextResponse.json({ greska: auth.poruka }, { status: 401 });

  const admin = supabaseAdmin();
  const { data } = await admin
    .from('poglavlja')
    .select('id, broj, naslov')
    .lte('broj', ZADNJA_NASTAVNA)
    .order('broj');

  const poglavlja = (data ?? []) as Cjelina[];
  if (poglavlja.length === 0) {
    return NextResponse.json({ greska: 'Sadržaj kolegija još nije učitan.' }, { status: 503 });
  }

  const kraj = mjeri();
  const redoslijed = promijesaj(poglavlja);

  async function pripremi(pog: Cjelina): Promise<ZavrsnoPitanje | null> {
    const { data: odjeljci } = await admin
      .from('odjeljci')
      .select('oznaka, naslov')
      .eq('poglavlje_id', pog.id)
      .order('redoslijed');

    const gradivo = (odjeljci ?? []).filter((o) => !NIJE_GRADIVO.test(o.naslov ?? ''));
    const odjeljak = gradivo.length ? gradivo[Math.floor(Math.random() * gradivo.length)] : null;

    // Naslov cjeline je pouzdana rezerva: dohvat po njemu prolazi u svakoj
    // cjelini, pa slab pogodak na razini odjeljka ne ruši pitanje.
    let chunks = await retrieve(odjeljak ? `${odjeljak.oznaka} ${odjeljak.naslov}` : pog.naslov, {
      poglavljeId: pog.id,
      topK: 8,
    });
    if (!dovoljnoKonteksta(chunks) && odjeljak) {
      chunks = await retrieve(pog.naslov, { poglavljeId: pog.id, topK: 8 });
    }
    if (!dovoljnoKonteksta(chunks)) return null;

    const rez = await askClaudeJson<{ pitanje?: string; kljucne_tocke?: string[] }>(
      buildZavrsniPitanjeSystemPrompt(),
      `Nastavna cjelina: Pogl. ${pog.broj}. ${pog.naslov}\nTežište: ${
        odjeljak ? `${odjeljak.oznaka} ${odjeljak.naslov}` : pog.naslov
      }\n\n<izvori>\n${chunks
        .map(
          (c) =>
            `<izvor odjeljak="${c.naslovOdjeljka}" stranice="${c.stranicaOd}-${c.stranicaDo}">\n${c.text}\n</izvor>`,
        )
        .join('\n\n')}\n</izvori>`,
      700,
    );

    if (!rez.pitanje?.trim()) return null;
    return {
      redni: 0,
      poglavljeBroj: pog.broj,
      opseg: `Pogl. ${pog.broj}. ${pog.naslov}`,
      pitanje: rez.pitanje.trim(),
      kljucneTocke: Array.isArray(rez.kljucne_tocke) ? rez.kljucne_tocke : [],
      citati: toCitations(chunks).slice(0, 3),
    };
  }

  // Prvo pet cjelina; ako neka ne da pitanje, mjesto popunjava sljedeća iz
  // pričuve. Tako ispit ima pet pitanja koliko je studentu obećano, a model se
  // ne poziva za cjeline koje nikad neće biti upotrijebljene.
  const skupljena: ZavrsnoPitanje[] = [];
  let sljedeca = 0;
  while (skupljena.length < PITANJA && sljedeca < redoslijed.length) {
    const serija = redoslijed.slice(sljedeca, sljedeca + (PITANJA - skupljena.length));
    sljedeca += serija.length;
    const rezultati = await Promise.all(serija.map(pripremi));
    skupljena.push(...rezultati.filter((p): p is ZavrsnoPitanje => p !== null));
  }

  const pitanja = skupljena.slice(0, PITANJA).map((p, i) => ({ ...p, redni: i + 1 }));

  await zabiljezi({
    vrsta: 'zavrsni_pitanja',
    imaKontekst: pitanja.length > 0,
    brojIsjecaka: pitanja.length,
    trajanjeMs: kraj(),
  });

  if (pitanja.length < 3) {
    return NextResponse.json(
      {
        greska:
          'Trenutačno nema dovoljno ingestiranog gradiva za završnu provjeru. Nastavnik treba pokrenuti ingest.',
      },
      { status: 503 },
    );
  }

  return NextResponse.json({ pitanja });
}

export async function GET() {
  try {
    return await GETImpl();
  } catch (e) {
    return odgovorNaGresku(e, 'Završnu provjeru trenutačno nije moguće pripremiti.');
  }
}
