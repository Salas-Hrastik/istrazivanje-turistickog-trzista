/**
 * Uvoz nastavnih elemenata koje je NAPISAO AUTOR, izravno iz priručnika:
 * ishoda učenja, ključnih pojmova i pitanja za provjeru znanja.
 *
 * Zašto uvoz, a ne `npm run nacrti`: nacrti postoje za knjige koje te elemente
 * nemaju, pa ih model izvodi iz teksta i nastavnik ih odobrava. Ovaj udžbenik
 * ih ima napisane u svakom poglavlju, pa ih nema smisla nagađati. Uvezeno se
 * zato upisuje ODMAH ODOBRENO i s `izvor_unosa = 'nastavnik'`.
 *
 * Odgovori se pritom PROMIJEŠAJU. U izvorniku je točan odgovor pod „b" u 27 od
 * 37 pitanja; sučelje miješa redoslijed pitanja, ali ne i odgovora unutar
 * pitanja, pa bi student pogađao slovo umjesto gradiva.
 *
 * Pokretanje:
 *   npm run nastavno -- --suho      # samo ispiši što bi uvezao
 *   npm run nastavno                # upiši u bazu
 *   npm run nastavno -- --poglavlje=4
 */
import { readDocx } from '../lib/docx';
import { segmentirajPrirucnik, type SegLekcija, type SegPoglavlje } from '../lib/prirucnik';
import { config } from '../lib/config';
import { supabaseAdmin } from '../lib/supabase';
import { kljucPitanja, ucitajObrazlozenja } from '../lib/obrazlozenja';

const ARGS = process.argv.slice(2);
const SUHO = ARGS.includes('--suho');
const SAMO = Number(ARGS.find((a) => a.startsWith('--poglavlje='))?.split('=')[1]);

/**
 * Kognitivna razina po Bloomu iz glagola kojim ishod počinje. Deterministički
 * izvod, ne procjena modela: udžbenik razinu ne navodi, a glagol je u ishodima
 * pisan namjerno i dosljedno.
 */
const RAZINA_PO_GLAGOLU: [RegExp, string][] = [
  [/^(definirati|navesti|nabrojati|prepoznati|imenovati)/i, 'znanje'],
  [/^(objasniti|opisati|razumjeti|obrazložiti|interpretirati)/i, 'razumijevanje'],
  [/^(primijeniti|izraditi|oblikovati|pripremiti|konstruirati|provesti|izračunati|dizajnirati)/i, 'primjena'],
  [/^(razlikovati|analizirati|usporediti|identificirati|razložiti|povezati)/i, 'analiza'],
  [/^(vrednovati|procijeniti|prosuditi|kritički|preporučiti|odabrati)/i, 'vrednovanje'],
];

function razina(tekst: string): string {
  for (const [re, r] of RAZINA_PO_GLAGOLU) if (re.test(tekst.trim())) return r;
  return 'razumijevanje';
}

/** „Sezonalnost — vremenska koncentracija…" → {pojam, definicija} */
function razlomiPojam(t: string): { pojam: string; definicija: string } | null {
  const m = /^(.{2,70}?)\s+[—–-]\s+(.{15,})$/.exec(t.trim());
  if (!m) return null;
  return { pojam: m[1].trim(), definicija: m[2].trim() };
}

/** „a) Prvi b) Drugi c) Treći" ili jedan odgovor po odlomku. */
function razlomiOdgovore(blokovi: string[]): string[] {
  const spojeno = blokovi.join(' ');
  const dijelovi = spojeno.split(/(?:^|\s)([a-dA-D])\)\s*/).slice(1);
  const odgovori: string[] = [];
  for (let i = 1; i < dijelovi.length; i += 2) {
    const t = dijelovi[i].trim().replace(/\s+/g, ' ');
    if (t) odgovori.push(t);
  }
  return odgovori;
}

interface Pitanje {
  pitanje: string;
  odgovori: string[];
  tocanIndex: number;
  objasnjenje: string;
  stranica: number;
}

/**
 * Autorovo obrazloženje nastavlja rečenicu započetu odgovorom („Netočno — za to
 * se koristi t-test."). Kad se odgovor odvoji u vlastito polje, ostatak u
 * sučelju stoji sam i mora početi velikim slovom.
 */
function velikoPocetno(t: string): string {
  const s = t.trim();
  return s ? s[0].toLocaleUpperCase('hr') + s.slice(1) : s;
}

/**
 * Tvrdnja s odgovorom „Točno." ili „Netočno — obrazloženje.". Kviz prikazuje
 * proizvoljan broj ponuđenih odgovora, pa tvrdnja postaje pitanje s dvije
 * opcije umjesto da se izgubi.
 */
function izvuciTocnoNetocno(lekcija: SegLekcija): Pitanje[] {
  const b = lekcija.blokovi;
  const pitanja: Pitanje[] = [];

  for (let i = 0; i < b.length - 1; i++) {
    const m = /^(\d{1,2})\.\s+(.{15,})$/.exec(b[i].tekst.trim());
    if (!m || b[i].vrsta !== 'tekst') continue;
    // Tvrdnja nema ponuđene odgovore — to je razlika prema pitanju s izborom.
    if (/(^|\s)[a-dA-D]\)\s/.test(b[i].tekst)) continue;

    const rj = /^(Točno|Netočno)\b\.?\s*[—–-]?\s*(.*)$/i.exec(b[i + 1].tekst.trim());
    if (!rj) continue;

    const tocno = /^Točno$/i.test(rj[1]);
    pitanja.push({
      pitanje: m[2].trim(),
      odgovori: ['Točno', 'Netočno'],
      tocanIndex: tocno ? 0 : 1,
      objasnjenje: velikoPocetno(rj[2]),
      stranica: b[i].stranica,
    });
    i++;
  }
  return pitanja;
}

/**
 * Pitanja unutar jednog odjeljka. Obrazac: redak „N. tekst pitanja", pa jedan
 * ili više odlomaka s ponuđenim odgovorima, pa „Točan odgovor: b. objašnjenje".
 * Sve što ne slijedi taj obrazac (spajanje parova, razvrstavanje, scenariji)
 * preskače se — ondje ne postoji skup ponuđenih odgovora.
 */
function izvuciPitanja(lekcija: SegLekcija): Pitanje[] {
  const b = lekcija.blokovi;
  const pitanja: Pitanje[] = [];

  for (let i = 0; i < b.length; i++) {
    const m = /^(\d{1,2})\.\s+(.{10,})$/.exec(b[i].tekst.trim());
    if (!m || b[i].vrsta !== 'tekst') continue;

    // Skupi ponuđene odgovore do retka s rješenjem.
    const kandidati: string[] = [];
    let j = i + 1;
    while (j < b.length && !/^Točan odgovor/i.test(b[j].tekst)) {
      if (/(^|\s)[a-dA-D]\)\s/.test(b[j].tekst)) kandidati.push(b[j].tekst);
      else if (kandidati.length > 0) break; // pitanje bez rješenja — odustani
      j++;
    }
    if (j >= b.length || kandidati.length === 0) continue;

    const odgovori = razlomiOdgovore(kandidati);
    const rj = /^Točan odgovor:\s*([a-dA-D])\b\.?\s*(.*)$/i.exec(b[j].tekst.trim());
    if (!rj || odgovori.length < 3) continue;

    const tocan = rj[1].toLowerCase().charCodeAt(0) - 97;
    if (tocan < 0 || tocan >= odgovori.length) continue;

    pitanja.push({
      pitanje: m[2].trim(),
      odgovori,
      tocanIndex: tocan,
      objasnjenje: velikoPocetno(rj[2]),
      stranica: b[i].stranica,
    });
    i = j;
  }
  return pitanja;
}

/** Fisher–Yates nad ponuđenim odgovorima, uz praćenje gdje je završio točan. */
function promijesaj(p: Pitanje): Pitanje {
  const idx = p.odgovori.map((_, i) => i);
  for (let i = idx.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  return {
    ...p,
    odgovori: idx.map((i) => p.odgovori[i]),
    tocanIndex: idx.indexOf(p.tocanIndex),
  };
}

const nadji = (p: SegPoglavlje, uzorak: RegExp) => p.lekcije.find((l) => uzorak.test(l.naslov));
const strRef = (od: number, doo: number) => (od === doo ? `str. ${od}` : `str. ${od}–${doo}`);

async function main() {
  const { odlomci, ukupnoStranica } = await readDocx(config.prirucnikDocxPath);
  const poglavlja = segmentirajPrirucnik(odlomci, ukupnoStranica);
  const nastavna = poglavlja.filter((p) => p.broj <= 7 && (!SAMO || p.broj === SAMO));

  // Banka pitanja stoji u Dodacima, a pripada prvom poglavlju.
  const dodaci = poglavlja.find((p) => p.broj === 8);
  const banka = dodaci?.lekcije.find((l) => /^Višestruki izbor$/i.test(l.naslov));
  const bankaTN = dodaci?.lekcije.find((l) => /^Točno \/ Netočno$/i.test(l.naslov));

  const sb = supabaseAdmin();
  const dopisana = ucitajObrazlozenja();
  let ukupno = { ciljevi: 0, kartice: 0, pitanja: 0 };

  for (const p of nastavna) {
    const { data: red } = await sb.from('poglavlja').select('id').eq('broj', p.broj).single();
    if (!red) {
      console.warn(`[nastavno] Cjelina ${p.broj} nije u bazi — preskačem.`);
      continue;
    }

    // --- Ishodi učenja ---
    const lIshodi = nadji(p, /Ishodi učenja/i);
    const ciljevi = (lIshodi?.blokovi ?? [])
      .filter((x) => x.vrsta === 'popis')
      .map((x, i) => ({
        poglavlje_id: red.id,
        tekst: x.tekst.replace(/[;.]\s*$/, '').trim(),
        kognitivna_razina: razina(x.tekst),
        stranica: x.stranica,
        redoslijed: i,
        odobreno: true,
      }));

    // --- Ključni pojmovi → kartice ---
    const lPojmovi = nadji(p, /^Ključni pojmovi$/i);
    const kartice = (lPojmovi?.blokovi ?? [])
      .map((x) => ({ raz: razlomiPojam(x.tekst), stranica: x.stranica }))
      .filter((x): x is { raz: { pojam: string; definicija: string }; stranica: number } => !!x.raz)
      .map((x, i) => ({
        poglavlje_id: red.id,
        pojam: x.raz.pojam,
        definicija: x.raz.definicija,
        stranica_ref: strRef(x.stranica, x.stranica),
        redoslijed: i,
        odobreno: true,
        izvor_unosa: 'nastavnik',
      }));

    // --- Pitanja ---
    const lProvjera = nadji(p, /Interaktivna provjera znanja/i);
    const sirova = [
      ...(lProvjera ? izvuciPitanja(lProvjera) : []),
      ...(lProvjera ? izvuciTocnoNetocno(lProvjera) : []),
      ...(p.broj === 1 && banka ? izvuciPitanja(banka) : []),
      ...(p.broj === 1 && bankaTN ? izvuciTocnoNetocno(bankaTN) : []),
    ];
    // Isto pitanje zna stajati i u cjelini i u banci pitanja iz Dodataka. Ostaje
    // ono iz cjeline — upućuje na gradivo, ne na popis na kraju knjige.
    const vidjena = new Set<string>();
    const jedinstvena = sirova.filter((q) => {
      const k = kljucPitanja(q.pitanje);
      if (vidjena.has(k)) return false;
      vidjena.add(k);
      return true;
    });

    const pitanja = jedinstvena.map(promijesaj).map((q) => ({
      poglavlje_id: red.id,
      pitanje: q.pitanje,
      odgovori: q.odgovori,
      tocan_index: q.tocanIndex,
      // Autorovo obrazloženje ima prednost; gdje ga nema, uzima se dopisano
      // (`npm run obrazlozenja`), da ponovni uvoz ne obriše taj rad.
      objasnjenje: q.objasnjenje || dopisana.get(kljucPitanja(q.pitanje)) || '',
      stranica_ref: strRef(q.stranica, q.stranica),
      odobreno: true,
      izvor_unosa: 'nastavnik',
    }));

    console.log(
      `[nastavno] Cjelina ${p.broj} „${p.naslov}": ` +
        `${ciljevi.length} ishoda · ${kartice.length} pojmova · ${pitanja.length} pitanja`,
    );

    if (SUHO) continue;

    // Ponovno pokretanje mora biti bezopasno: uvezeno se zamjenjuje, a ono što
    // je nastavnik ručno dodao drugim putem ostaje.
    await sb.from('ciljevi_ucenja').delete().eq('poglavlje_id', red.id);
    await sb.from('kartice').delete().eq('poglavlje_id', red.id).eq('izvor_unosa', 'nastavnik');
    await sb.from('kviz_pitanja').delete().eq('poglavlje_id', red.id).eq('izvor_unosa', 'nastavnik');

    if (ciljevi.length) {
      const { error } = await sb.from('ciljevi_ucenja').insert(ciljevi);
      if (error) throw new Error(`ciljevi (cjelina ${p.broj}): ${error.message}`);
    }
    if (kartice.length) {
      const { error } = await sb.from('kartice').insert(kartice);
      if (error) throw new Error(`kartice (cjelina ${p.broj}): ${error.message}`);
    }
    if (pitanja.length) {
      const { error } = await sb.from('kviz_pitanja').insert(pitanja);
      if (error) throw new Error(`kviz (cjelina ${p.broj}): ${error.message}`);
    }

    ukupno = {
      ciljevi: ukupno.ciljevi + ciljevi.length,
      kartice: ukupno.kartice + kartice.length,
      pitanja: ukupno.pitanja + pitanja.length,
    };
  }

  console.log(
    SUHO
      ? '\n[nastavno] --suho: ništa nije upisano.'
      : `\n[nastavno] Upisano: ${ukupno.ciljevi} ishoda, ${ukupno.kartice} kartica, ${ukupno.pitanja} pitanja — sve odobreno.`,
  );
}

main().catch((e) => {
  console.error('[nastavno] GREŠKA:', e);
  process.exit(1);
});
