/**
 * Priprema NACRTA nastavnih elemenata koje priručnik nema kao zaseban tekst:
 * ciljeva učenja, kartica za učenje i kviz pitanja — sve na razini NASTAVNE
 * CJELINE (poglavlja).
 *
 * VAŽNO — ovo NIJE izmišljanje sadržaja:
 *  - model dobiva isključivo sažetak cjeline i ingestirane isječke priručnika,
 *    i ne smije izaći iz njih;
 *  - sve što nastane upisuje se s `odobreno = false` i studentima se NE prikazuje;
 *  - nastavnik nacrte pregledava i odobrava (ili briše), odnosno unosi vlastita
 *    pitanja skriptom `npm run kviz:uvezi`.
 * Time je zadovoljeno pravilo „ne izmišljaj pitanja": ništa neodobreno ne dolazi
 * pred studenta.
 *
 * Pokretanje:
 *   npm run nacrti -- --ciljevi                  # ciljevi učenja za sve cjeline
 *   npm run nacrti -- --kartice                  # kartice za učenje
 *   npm run nacrti -- --kviz                     # kviz pitanja
 *   npm run nacrti -- --ciljevi --kartice --kviz --poglavlje=4
 */
import { askClaudeJson } from '../lib/claude';
import { retrieve } from '../lib/retrieval';
import { supabaseAdmin } from '../lib/supabase';
import { PRIRUCNIK } from '../lib/prompt';
import { kljucPitanja } from '../lib/obrazlozenja';

const ARGS = process.argv.slice(2);
const RADI_CILJEVE = ARGS.includes('--ciljevi');
const RADI_KARTICE = ARGS.includes('--kartice');
const RADI_KVIZ = ARGS.includes('--kviz');
const SAMO_POGLAVLJE = ARGS.find((a) => a.startsWith('--poglavlje='))?.split('=')[1];
/** Koliko pitanja cjelina ukupno treba imati, računajući i autorova. */
const CILJ_PITANJA = Number(ARGS.find((a) => a.startsWith('--cilj='))?.split('=')[1]) || 10;

const KARTICA_PO_CJELINI = 10;
/** Sažetak cjeline zna biti dug; modelu ide početak, a ostatak stiže kroz isječke. */
const SAZETAK_LIMIT = 12000;

const OGRADA = `Radiš isključivo iz priloženog sažetka cjeline i isječaka izvora ${PRIRUCNIK}. Ne dodaješ pojmove, primjere ni brojke kojih u priloženom tekstu nema. Odgovaraš na hrvatskom, terminologijom priručnika, i ISKLJUČIVO validnim JSON-om bez markdown ograda.

VAŽNO ZA OBLIK: nizovi moraju biti pravi JSON nizovi, nikad tekst koji izgleda kao niz. U vrijednostima NE koristi navodnike (ni " ni „ "), jer razbijaju JSON — istakni pojam bez njih ili ga stavi u zagradu.`;

/**
 * Sheme izlaza. Prompt sam nije dovoljan: bez zadane sheme model zna vratiti
 * objekt ondje gdje se očekuje niz, pa unos pukne na `.filter is not a function`.
 */
const SHEMA_CILJEVI = {
  type: 'object',
  properties: {
    ciljevi: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          tekst: { type: 'string' },
          kognitivna_razina: { type: 'string' },
          stranica: { type: 'integer' },
        },
        required: ['tekst'],
      },
    },
  },
  required: ['ciljevi'],
};

const SHEMA_KARTICE = {
  type: 'object',
  properties: {
    kartice: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          pojam: { type: 'string' },
          definicija: { type: 'string' },
          stranica_ref: { type: 'string' },
        },
        required: ['pojam', 'definicija'],
      },
    },
  },
  required: ['kartice'],
};

const SHEMA_KVIZ = {
  type: 'object',
  properties: {
    pitanja: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          pitanje: { type: 'string' },
          odgovori: { type: 'array', items: { type: 'string' } },
          tocan_index: { type: 'integer' },
          objasnjenje: { type: 'string' },
          stranica_ref: { type: 'string' },
          odjeljak: { type: 'string' },
        },
        required: ['pitanje', 'odgovori', 'tocan_index'],
      },
    },
  },
  required: ['pitanja'],
};

/**
 * Model unatoč shemi povremeno vrati objekt (npr. {"1": {...}, "2": {...}})
 * ondje gdje se očekuje niz, pa se izlaz normalizira umjesto da unos pukne.
 */
function uNiz<T>(vrijednost: unknown, oznaka: string): T[] {
  if (Array.isArray(vrijednost)) return vrijednost as T[];

  // Najčešći promašaj: niz je serijaliziran u string umjesto da ostane niz.
  if (typeof vrijednost === 'string') {
    try {
      const raspakiran = JSON.parse(vrijednost);
      console.warn(`[nacrti] ${oznaka}: sadržaj je stigao kao JSON string — raspakiran.`);
      return uNiz<T>(raspakiran, oznaka);
    } catch {
      // nije valjan JSON — pada niže
    }
  }

  if (vrijednost && typeof vrijednost === 'object') {
    const vrijednosti = Object.values(vrijednost as Record<string, unknown>);
    if (vrijednosti.every((v) => v && typeof v === 'object' && !Array.isArray(v))) {
      console.warn(`[nacrti] ${oznaka}: model je vratio objekt umjesto niza — pretvoreno.`);
      return vrijednosti as T[];
    }
    const ugnijezden = vrijednosti.find((v) => Array.isArray(v));
    if (ugnijezden) {
      console.warn(`[nacrti] ${oznaka}: niz je bio ugniježđen — izvučen.`);
      return ugnijezden as T[];
    }
  }
  console.warn(
    `[nacrti] ${oznaka}: neprepoznat oblik (${typeof vrijednost}, duljina ${
      typeof vrijednost === 'string' ? vrijednost.length : '—'
    }).`,
  );
  return [];
}

interface Cjelina {
  id: string;
  broj: number;
  naslov: string;
  stranica_od: number;
  stranica_do: number;
  sazetak_md: string;
}

async function main() {
  if (!RADI_CILJEVE && !RADI_KARTICE && !RADI_KVIZ) {
    console.log('Navedite --ciljevi, --kartice i/ili --kviz.');
    console.log('Primjer: npm run nacrti -- --ciljevi --kartice --kviz --poglavlje=4');
    return;
  }

  const sb = supabaseAdmin();
  let upit = sb
    .from('poglavlja')
    .select('id, broj, naslov, stranica_od, stranica_do, sazetak_md')
    .order('broj');
  if (SAMO_POGLAVLJE) upit = upit.eq('broj', Number(SAMO_POGLAVLJE));
  const { data: cjeline, error } = await upit;
  if (error) throw new Error(error.message);

  for (const cjelina of (cjeline ?? []) as Cjelina[]) {
    const chunks = await retrieve(cjelina.naslov, { poglavljeId: cjelina.id, topK: 14 });
    if (chunks.length === 0 && !cjelina.sazetak_md) {
      console.warn(`[nacrti] Cjelina ${cjelina.broj} — nema ingestiranog sadržaja, preskačem.`);
      continue;
    }
    const kontekst = kontekstCjeline(cjelina, chunks);

    if (RADI_CILJEVE) await ciljevi(cjelina, kontekst);
    if (RADI_KARTICE) await kartice(cjelina, kontekst);
    // Dodaci nisu nastavna cjelina: ondje su kazalo, prilozi i literatura, pa bi
    // pitanja ispitivala aparat knjige („što označava kratica DPO"), ne gradivo.
    if (RADI_KVIZ && cjelina.broj <= 7) await kviz(cjelina, kontekst);
  }

  console.log('\n[nacrti] Nacrti NISU vidljivi studentima dok ih nastavnik ne odobri:');
  console.log("  update ciljevi_ucenja set odobreno = true where poglavlje_id = '…';");
  console.log("  update kartice        set odobreno = true where poglavlje_id = '…';");
  console.log("  update kviz_pitanja   set odobreno = true where poglavlje_id = '…';");
}

function kontekstCjeline(c: Cjelina, chunks: Awaited<ReturnType<typeof retrieve>>): string {
  const izvori = chunks
    .map((x) => `<izvor odjeljak="${x.naslovOdjeljka}" stranice="${x.stranicaOd}-${x.stranicaDo}">\n${x.text}\n</izvor>`)
    .join('\n\n');
  return `Nastavna cjelina: ${c.broj}. ${c.naslov} (str. ${c.stranica_od}–${c.stranica_do})

<sazetak_cjeline>
${(c.sazetak_md || '').slice(0, SAZETAK_LIMIT)}
</sazetak_cjeline>

<izvori>
${izvori || '(nema dodatnih isječaka)'}
</izvori>`;
}

// --- Ciljevi učenja ---------------------------------------------------------
async function ciljevi(c: Cjelina, kontekst: string) {
  const sb = supabaseAdmin();
  const system = `${OGRADA}

Pripremaš CILJEVE UČENJA za jednu nastavnu cjelinu. Svaki cilj:
 - formuliran je infinitivom ("objasniti…", "razlikovati…", "primijeniti…");
 - odnosi se na sadržaj koji stvarno postoji u priloženom tekstu;
 - ima kognitivnu razinu po Bloomu: "znanje" | "razumijevanje" | "primjena" | "analiza" | "vrednovanje";
 - ima stranicu na kojoj se gradivo nalazi.

Vrati 4–6 ciljeva koji zajedno pokrivaju cijelu cjelinu:
{"ciljevi": [{"tekst": "…", "kognitivna_razina": "…", "stranica": 12}]}`;

  const rez = await askClaudeJson<{
    ciljevi?: { tekst: string; kognitivna_razina?: string; stranica?: number }[];
  }>(system, kontekst, 2000, undefined, SHEMA_CILJEVI);

  const stavke = uNiz<{ tekst: string; kognitivna_razina?: string; stranica?: number }>(rez.ciljevi, `ciljevi cj.${c.broj}`).filter((x) => x.tekst?.trim());
  if (stavke.length === 0) {
    console.warn(`[nacrti] Cjelina ${c.broj} — model nije vratio ciljeve.`);
    return;
  }

  await sb.from('ciljevi_ucenja').delete().eq('poglavlje_id', c.id).eq('odobreno', false);
  const { error } = await sb.from('ciljevi_ucenja').insert(
    stavke.map((x, i) => ({
      poglavlje_id: c.id,
      tekst: x.tekst,
      kognitivna_razina: x.kognitivna_razina ?? '',
      stranica: Number.isFinite(x.stranica) ? x.stranica : c.stranica_od,
      redoslijed: i,
      odobreno: false,
    })),
  );
  if (error) throw new Error(`ciljevi (cjelina ${c.broj}): ${error.message}`);
  console.log(`[nacrti] Cjelina ${c.broj} „${c.naslov}": ${stavke.length} nacrta ciljeva`);
}

// --- Kartice za učenje ------------------------------------------------------
async function kartice(c: Cjelina, kontekst: string) {
  const sb = supabaseAdmin();
  const system = `${OGRADA}

Pripremaš KARTICE ZA UČENJE za jednu nastavnu cjelinu (pojam → definicija).
Pravila:
 - "pojam" je stručni termin ili model iz priručnika (npr. „neprobabilistički uzorak", „izviđajno istraživanje");
 - "definicija" je 1–2 rečenice, doslovno utemeljene na priloženom tekstu, u terminologiji priručnika;
 - ne izmišljaj pojmove kojih u tekstu nema i ne ponavljaj isti pojam;
 - "stranica_ref" je oznaka stranice u obliku "str. 24" ili "str. 24–25".

Vrati do ${KARTICA_PO_CJELINI} kartica, poredanih onako kako se pojmovi pojavljuju u cjelini:
{"kartice": [{"pojam": "…", "definicija": "…", "stranica_ref": "str. 24–25"}]}`;

  const rez = await askClaudeJson<{
    kartice?: { pojam: string; definicija: string; stranica_ref?: string }[];
  }>(system, kontekst, 6000, undefined, SHEMA_KARTICE);

  const stavke = uNiz<{ pojam: string; definicija: string; stranica_ref?: string }>(rez.kartice, `kartice cj.${c.broj}`).filter((x) => x.pojam?.trim() && x.definicija?.trim());
  if (stavke.length === 0) {
    console.warn(`[nacrti] Cjelina ${c.broj} — model nije vratio kartice.`);
    return;
  }

  await sb.from('kartice').delete().eq('poglavlje_id', c.id).eq('izvor_unosa', 'nacrt').eq('odobreno', false);
  const { error } = await sb.from('kartice').insert(
    stavke.slice(0, KARTICA_PO_CJELINI).map((x, i) => ({
      poglavlje_id: c.id,
      pojam: x.pojam.trim(),
      definicija: x.definicija.trim(),
      stranica_ref: x.stranica_ref ?? '',
      redoslijed: i,
      odobreno: false,
      izvor_unosa: 'nacrt',
    })),
  );
  if (error) throw new Error(`kartice (cjelina ${c.broj}): ${error.message}`);
  console.log(`[nacrti] Cjelina ${c.broj} „${c.naslov}": ${stavke.length} nacrta kartica`);
}

// --- Kviz pitanja -----------------------------------------------------------
async function kviz(c: Cjelina, kontekst: string) {
  const sb = supabaseAdmin();

  // Autorova pitanja su mjerilo: nacrt samo NADOPUNJUJE cjelinu do cilja i ne
  // smije ponoviti ono što u priručniku već stoji.
  const { data: postojeca } = await sb
    .from('kviz_pitanja')
    .select('pitanje')
    .eq('poglavlje_id', c.id)
    .eq('izvor_unosa', 'nastavnik');
  const vec = (postojeca ?? []).map((p) => p.pitanje);
  const treba = Math.max(0, CILJ_PITANJA - vec.length);
  if (treba === 0) {
    console.log(
      `[nacrti] Cjelina ${c.broj} „${c.naslov}": ${vec.length} autorovih pitanja — nadopuna nije potrebna.`,
    );
    return;
  }

  const izbjegni = vec.length
    ? `\n\nU CJELINI VEĆ POSTOJE OVA PITANJA — ne ponavljaj ih ni u drukčijoj formulaciji, i ne provjeravaj isti pojam kojim se ona bave:\n${vec.map((p) => `- ${p}`).join('\n')}\n\nTraži gradivo cjeline koje ta pitanja NE pokrivaju.`
    : '';

  const system = `${OGRADA}

Pripremaš NACRT kviza za jednu nastavnu cjelinu. Pitanja moraju pokriti cijelu cjelinu, ne samo jedan odjeljak.
Pravila za svako pitanje:
 - točno 4 ponuđena odgovora, točno jedan točan;
 - odgovor mora biti nedvojbeno provjerljiv u priloženom tekstu;
 - netočne opcije moraju biti uvjerljive, ali jasno netočne prema priručniku;
 - objašnjenje je jedna do dvije rečenice, bez navođenja stranice u tekstu objašnjenja;
 - ne počinji objašnjenje s Točan odgovor je — student već vidi koji je točan;
 - u tekstu pitanja NE piši prema priručniku ni prema autoru — student zna iz kojeg gradiva uči, pa pitaj izravno;
 - točan odgovor RASPOREDI po pozicijama, ne stavljaj ga uvijek na isto mjesto.${izbjegni}

Vrati točno ${treba} pitanja:
{"pitanja": [{"pitanje": "…", "odgovori": ["…","…","…","…"], "tocan_index": 0, "objasnjenje": "…", "stranica_ref": "str. 24–25", "odjeljak": "4.4"}]}`;

  const rez = await askClaudeJson<{
    pitanja?: {
      pitanje: string;
      odgovori: string[];
      tocan_index: number;
      objasnjenje?: string;
      stranica_ref?: string;
      odjeljak?: string;
    }[];
  }>(system, kontekst, 8000, undefined, SHEMA_KVIZ);

  const valjana = uNiz<{
    pitanje: string;
    odgovori: string[];
    tocan_index: number;
    objasnjenje?: string;
    stranica_ref?: string;
    odjeljak?: string;
  }>(rez.pitanja, `kviz cj.${c.broj}`).filter(
    (p) =>
      p.pitanje?.trim() &&
      Array.isArray(p.odgovori) &&
      p.odgovori.length === 4 &&
      p.odgovori.every((o) => o?.trim()) &&
      Number.isInteger(p.tocan_index) &&
      p.tocan_index >= 0 &&
      p.tocan_index <= 3,
  );
  // Model ne raspoređuje točan odgovor unatoč uputi — u praksi ga gura na prvo
  // ili drugo mjesto, a četvrto ostaje prazno. Miješa se isto kao autorova
  // pitanja u `npm run nastavno`, jer inače student pogađa položaj.
  for (const p of valjana) {
    const idx = p.odgovori.map((_, i) => i);
    for (let i = idx.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [idx[i], idx[j]] = [idx[j], idx[i]];
    }
    p.odgovori = idx.map((i) => p.odgovori[i]);
    p.tocan_index = idx.indexOf(p.tocan_index);
  }

  // Model zna ponoviti postojeće pitanje unatoč uputi; posljednja brana.
  const poznata = new Set(vec.map(kljucPitanja));
  const nova = valjana
    .filter((p) => {
      const k = kljucPitanja(p.pitanje);
      if (poznata.has(k)) return false;
      poznata.add(k);
      return true;
    })
    .slice(0, treba);

  if (nova.length === 0) {
    console.warn(`[nacrti] Cjelina ${c.broj} — model nije vratio nova valjana pitanja.`);
    return;
  }

  const { data: odjeljci } = await sb.from('odjeljci').select('id, oznaka').eq('poglavlje_id', c.id);
  const poOznaci = new Map((odjeljci ?? []).filter((o) => o.oznaka).map((o) => [o.oznaka, o.id]));

  await sb.from('kviz_pitanja').delete().eq('poglavlje_id', c.id).eq('izvor_unosa', 'nacrt').eq('odobreno', false);
  const { error } = await sb.from('kviz_pitanja').insert(
    nova.map((p) => ({
      poglavlje_id: c.id,
      odjeljak_id: p.odjeljak ? poOznaci.get(p.odjeljak) ?? null : null,
      pitanje: p.pitanje,
      odgovori: p.odgovori,
      tocan_index: p.tocan_index,
      objasnjenje: p.objasnjenje ?? '',
      stranica_ref: p.stranica_ref ?? '',
      odobreno: false,
      izvor_unosa: 'nacrt',
    })),
  );
  if (error) throw new Error(`kviz (cjelina ${c.broj}): ${error.message}`);
  console.log(
    `[nacrti] Cjelina ${c.broj} „${c.naslov}": ${vec.length} autorovih + ${nova.length} nacrta = ${vec.length + nova.length}`,
  );
  for (const p of nova) console.log(`      · ${p.pitanje}`);
}

main().catch((err) => {
  console.error('[nacrti] GREŠKA:', err);
  process.exit(1);
});
