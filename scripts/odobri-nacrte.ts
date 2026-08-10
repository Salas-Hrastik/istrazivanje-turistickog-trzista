/**
 * Pregled i odobravanje NACRTA kviz pitanja.
 *
 * `npm run nacrti -- --kviz` upisuje pitanja s `odobreno = false`; studentima se
 * ne prikazuju dok ih nastavnik ne odobri. Dosad je to tražilo ručni SQL, pa je
 * pregled u praksi izostajao — a nacrt koji nitko ne pregleda ili zauvijek stoji
 * skriven ili se odobri neviđen. Oboje je gore od ovoga.
 *
 * Pokretanje:
 *   npm run nacrti:pregled                      # ispiši sve nacrte s odgovorima
 *   npm run nacrti:pregled -- --poglavlje=4
 *   npm run nacrti:pregled -- --odobri --poglavlje=4     # objavi cjelinu 4
 *   npm run nacrti:pregled -- --odobri --sve             # objavi sve
 *   npm run nacrti:pregled -- --odbaci --poglavlje=4     # obriši nacrte cjeline 4
 */
import { supabaseAdmin } from '../lib/supabase';

const ARGS = process.argv.slice(2);
const ODOBRI = ARGS.includes('--odobri');
const ODBACI = ARGS.includes('--odbaci');
const SVE = ARGS.includes('--sve');
const POGLAVLJE = ARGS.find((a) => a.startsWith('--poglavlje='))?.split('=')[1];

async function main() {
  if (ODOBRI && ODBACI) {
    console.error('Odaberite --odobri ili --odbaci, ne oboje.');
    process.exit(1);
  }
  if ((ODOBRI || ODBACI) && !POGLAVLJE && !SVE) {
    console.error('Navedite --poglavlje=N ili --sve. Bez toga se ništa ne mijenja.');
    process.exit(1);
  }

  const sb = supabaseAdmin();
  const { data: poglavlja } = await sb.from('poglavlja').select('id, broj, naslov').order('broj');
  const ciljane = (poglavlja ?? []).filter((p) => !POGLAVLJE || String(p.broj) === POGLAVLJE);

  let ukupno = 0;
  for (const p of ciljane) {
    const { data: nacrti } = await sb
      .from('kviz_pitanja')
      .select('id, pitanje, odgovori, tocan_index, objasnjenje, stranica_ref')
      .eq('poglavlje_id', p.id)
      .eq('izvor_unosa', 'nacrt')
      .eq('odobreno', false);
    if (!nacrti?.length) continue;

    console.log(`\n──── Cjelina ${p.broj}: ${p.naslov} — ${nacrti.length} nacrta ────`);
    for (const q of nacrti) {
      console.log(`\n  ${q.pitanje}`);
      (q.odgovori as string[]).forEach((o, i) =>
        console.log(`     ${i === q.tocan_index ? '✔' : ' '} ${o}`),
      );
      if (q.objasnjenje) console.log(`     ↳ ${q.objasnjenje}`);
      if (q.stranica_ref) console.log(`     ${q.stranica_ref}`);
    }
    ukupno += nacrti.length;

    if (ODOBRI) {
      const { error } = await sb
        .from('kviz_pitanja')
        .update({ odobreno: true })
        .eq('poglavlje_id', p.id)
        .eq('izvor_unosa', 'nacrt');
      if (error) throw new Error(`Odobravanje (cjelina ${p.broj}): ${error.message}`);
    }
    if (ODBACI) {
      const { error } = await sb
        .from('kviz_pitanja')
        .delete()
        .eq('poglavlje_id', p.id)
        .eq('izvor_unosa', 'nacrt')
        .eq('odobreno', false);
      if (error) throw new Error(`Odbacivanje (cjelina ${p.broj}): ${error.message}`);
    }
  }

  if (ukupno === 0) {
    console.log('Nema neodobrenih nacrta.');
    return;
  }
  if (ODOBRI) console.log(`\n✔ Odobreno ${ukupno} pitanja — od sada su vidljiva studentima.`);
  else if (ODBACI) console.log(`\n✘ Obrisano ${ukupno} nacrta.`);
  else {
    console.log(`\n${ukupno} nacrta čeka odluku. Studentima se NE prikazuju.`);
    console.log('  npm run nacrti:pregled -- --odobri --poglavlje=N   (ili --sve)');
    console.log('  npm run nacrti:pregled -- --odbaci --poglavlje=N');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
