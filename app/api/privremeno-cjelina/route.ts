/**
 * PRIVREMENA ruta: upis cjeline 9 (TOMAS) iz produkcije, gdje su ključevi
 * Supabasea i OpenAI-ja već postavljeni. Uklanja se odmah nakon upisa.
 *
 * Zaštita: zaglavlje x-tajna mora dati SHA-256 naveden ispod.
 *
 *   POST ?korak=tekst     tijelo: Markdown cjeline
 *   POST ?korak=potpis    tijelo: {putevi: [...]} → potpisani URL-ovi za upload
 *   POST ?korak=mediji    tijelo: {stavke: [{tip, naslov, url, trajanje_s}]}
 *   POST ?korak=kviz      tijelo: data/kviz-poglavlje-9.json
 *   POST ?korak=kartice   tijelo: data/kartice-poglavlje-9.json
 *   POST ?korak=ciljevi   tijelo: data/ciljevi-poglavlje-9.json
 */
import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { config, mapaCjeline } from '@/lib/config';
import { supabaseAdmin } from '@/lib/supabase';
import { ucitajCjelinu } from '@/lib/ingest-cjelina';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

const SAZETAK_TAJNE = '06ccda45cfee9d45bbaa2f76dd73d083e0de8a9e22458aa5191ab6170cb27280';
const BROJ = 9;

export async function POST(request: NextRequest) {
  const tajna = request.headers.get('x-tajna') ?? '';
  if (createHash('sha256').update(tajna).digest('hex') !== SAZETAK_TAJNE) {
    return NextResponse.json({ greska: 'Nije ovlašteno.' }, { status: 401 });
  }
  const korak = request.nextUrl.searchParams.get('korak') ?? '';
  if (!['tekst', 'potpis', 'mediji', 'kviz', 'kartice', 'ciljevi'].includes(korak)) {
    return NextResponse.json({ greska: 'Nepoznat korak.' }, { status: 400 });
  }

  try {
    const sb = supabaseAdmin();

    if (korak === 'tekst') {
      const zapis: string[] = [];
      const rez = await ucitajCjelinu(await request.text(), { log: (p) => zapis.push(p) });
      return NextResponse.json({ ...rez, zapis });
    }

    const ulaz = await request.json();

    if (korak === 'potpis') {
      const mapa = mapaCjeline(BROJ);
      const rez = [];
      for (const ime of (ulaz.putevi ?? []) as string[]) {
        if (!/^[\w./-]+$/.test(ime) || ime.includes('..')) throw new Error(`Neispravan put: ${ime}`);
        const put = `${mapa}/${ime}`;
        const { data, error } = await sb.storage.from(config.storageBucket).createSignedUploadUrl(put, { upsert: true });
        if (error) throw new Error(`${put}: ${error.message}`);
        rez.push({ ime, signedUrl: data.signedUrl, javni: sb.storage.from(config.storageBucket).getPublicUrl(put).data.publicUrl });
      }
      return NextResponse.json({ potpisi: rez });
    }

    const { data: pog } = await sb.from('poglavlja').select('id').eq('broj', BROJ).single();
    if (!pog) throw new Error(`Nema cjeline ${BROJ}.`);
    const { data: odjeljci } = await sb.from('odjeljci').select('id, oznaka').eq('poglavlje_id', pog.id);
    const odj = new Map((odjeljci ?? []).map((o) => [o.oznaka, o.id]));

    if (korak === 'mediji') {
      const stavke = (ulaz.stavke ?? []) as { tip: string; naslov: string; url: string; trajanje_s?: number }[];
      await sb.from('mediji').delete().eq('poglavlje_id', pog.id);
      const { error } = await sb.from('mediji').insert(
        stavke.map((s, i) => ({ poglavlje_id: pog.id, tip: s.tip, naslov: s.naslov, url: s.url, trajanje_s: s.trajanje_s ?? null, redoslijed: i })),
      );
      if (error) throw new Error(error.message);
      return NextResponse.json({ mediji: stavke.length });
    }

    if (korak === 'kviz') {
      const pitanja = (ulaz.pitanja ?? []) as {
        odjeljak_oznaka?: string; pitanje: string; odgovori: string[];
        tocan_index: number; objasnjenje?: string; stranica_ref?: string;
      }[];
      await sb.from('kviz_pitanja').delete().eq('poglavlje_id', pog.id).eq('izvor_unosa', 'nastavnik');
      const { error } = await sb.from('kviz_pitanja').insert(
        pitanja.map((p) => ({
          poglavlje_id: pog.id,
          odjeljak_id: p.odjeljak_oznaka ? odj.get(p.odjeljak_oznaka) ?? null : null,
          pitanje: p.pitanje, odgovori: p.odgovori, tocan_index: p.tocan_index,
          objasnjenje: p.objasnjenje ?? '', stranica_ref: p.stranica_ref ?? '',
          odobreno: true, izvor_unosa: 'nastavnik',
        })),
      );
      if (error) throw new Error(error.message);
      return NextResponse.json({ kviz: pitanja.length });
    }

    if (korak === 'kartice') {
      const kartice = (ulaz.kartice ?? []) as { odjeljak_oznaka?: string; pojam: string; definicija: string; stranica_ref?: string }[];
      await sb.from('kartice').delete().eq('poglavlje_id', pog.id).eq('izvor_unosa', 'nastavnik');
      const { error } = await sb.from('kartice').insert(
        kartice.map((k, i) => ({
          poglavlje_id: pog.id,
          odjeljak_id: k.odjeljak_oznaka ? odj.get(k.odjeljak_oznaka) ?? null : null,
          pojam: k.pojam, definicija: k.definicija, stranica_ref: k.stranica_ref ?? '',
          redoslijed: i, odobreno: true, izvor_unosa: 'nastavnik',
        })),
      );
      if (error) throw new Error(error.message);
      return NextResponse.json({ kartice: kartice.length });
    }

    const ciljevi = (ulaz.ciljevi ?? []) as { tekst: string; kognitivna_razina?: string; stranica?: number }[];
    await sb.from('ciljevi_ucenja').delete().eq('poglavlje_id', pog.id);
    const { error } = await sb.from('ciljevi_ucenja').insert(
      ciljevi.map((c, i) => ({
        poglavlje_id: pog.id, tekst: c.tekst, kognitivna_razina: c.kognitivna_razina ?? '',
        stranica: c.stranica ?? null, redoslijed: i, odobreno: true,
      })),
    );
    if (error) throw new Error(error.message);
    return NextResponse.json({ ciljevi: ciljevi.length });
  } catch (e) {
    return NextResponse.json({ greska: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
