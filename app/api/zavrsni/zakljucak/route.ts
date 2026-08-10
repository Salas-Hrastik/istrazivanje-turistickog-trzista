import { NextRequest, NextResponse } from 'next/server';
import { zahtijevajKorisnika } from '@/lib/auth';
import { buildZavrsniZakljucakSystemPrompt } from '@/lib/prompt';
import { askClaudeJson } from '@/lib/claude';
import { mjeri, zabiljezi } from '@/lib/telemetrija';
import { odgovorNaGresku } from '@/lib/greske';

export const runtime = 'nodejs';
export const maxDuration = 60;

const SHEMA = {
  type: 'object',
  properties: {
    zakljucak: { type: 'string' },
    preporuke: { type: 'array', items: { type: 'string' } },
  },
  required: ['zakljucak'],
} as const;

interface Stavka {
  opseg?: string;
  pitanje?: string;
  ocjena?: string;
  pokrio?: string[];
  izostalo?: string[];
}

/**
 * POST /api/zavrsni/zakljucak — { stavke: [...] }
 *
 * Zaključna riječ nakon svih pet pitanja. Ne dohvaća isječke: sudi o onome što
 * je već procijenjeno po pitanju, a svaka od tih procjena bila je utemeljena na
 * priručniku. Zato ovdje nema opasnosti od izmišljanja gradiva — model sažima,
 * ne tvrdi ništa novo.
 */
async function POSTImpl(request: NextRequest) {
  const auth = await zahtijevajKorisnika();
  if (!auth.ok) return NextResponse.json({ greska: auth.poruka }, { status: 401 });

  const body = await request.json();
  const stavke: Stavka[] = Array.isArray(body?.stavke) ? body.stavke.slice(0, 8) : [];
  if (stavke.length === 0) {
    return NextResponse.json({ greska: 'Nema odgovora za zaključak.' }, { status: 400 });
  }

  const kraj = mjeri();
  const pregled = stavke
    .map(
      (s, i) =>
        `${i + 1}. [${s.opseg ?? 'nepoznata cjelina'}] ${s.pitanje ?? ''}\n` +
        `   procjena: ${s.ocjena ?? 'nepoznato'}\n` +
        `   pokrio: ${s.pokrio?.length ? s.pokrio.join('; ') : '—'}\n` +
        `   izostalo: ${s.izostalo?.length ? s.izostalo.join('; ') : '—'}`,
    )
    .join('\n\n');

  const rez = await askClaudeJson<{ zakljucak?: string; preporuke?: string[] }>(
    buildZavrsniZakljucakSystemPrompt(),
    `TIJEK ZAVRŠNE USMENE PROVJERE:\n\n${pregled}`,
    800,
    undefined,
    SHEMA,
  );

  await zabiljezi({
    vrsta: 'zavrsni_zakljucak',
    imaKontekst: true,
    brojIsjecaka: stavke.length,
    trajanjeMs: kraj(),
  });

  return NextResponse.json({
    zakljucak:
      (rez.zakljucak ?? '').trim() ||
      'Time smo završili provjeru. Pregledajte cjeline u kojima je odgovor bio nepotpun.',
    preporuke: Array.isArray(rez.preporuke) ? rez.preporuke : [],
  });
}

export async function POST(request: NextRequest) {
  try {
    return await POSTImpl(request);
  } catch (e) {
    return odgovorNaGresku(e, 'Zaključak provjere trenutačno nije dostupan.');
  }
}
