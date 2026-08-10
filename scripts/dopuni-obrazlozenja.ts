/**
 * Dopunjuje OBRAZLOŽENJA uz kviz pitanja i uklanja dvostruke unose.
 *
 * Autor je u priručniku uz dio pitanja napisao i obrazloženje, uz većinu nije.
 * Student koji promaši tada dobije samo „netočno" i ne dozna zašto — a upravo
 * je obrazloženje ono što kviz pretvara iz provjere u učenje.
 *
 * VAŽNO — ovo NIJE izmišljanje sadržaja:
 *  - model dobiva isključivo isječke priručnika dohvaćene za to pitanje i ne
 *    smije izaći iz njih;
 *  - obrazlaže se SAMO zašto je točan odgovor točan (i, ako tekst to nosi,
 *    zašto ponuđene zamke nisu) — pitanja i odgovori se ne diraju;
 *  - ako u dohvaćenom tekstu nema podloge, model vraća prazno i pitanje ostaje
 *    bez obrazloženja, umjesto da dobije uvjerljivu izmišljotinu.
 *
 * Dvostruki unosi: banka pitanja iz Dodataka ponavlja dio pitanja iz samih
 * cjelina. Ostaje zapis iz cjeline (ima precizniju stranicu), a obrazloženje se
 * preuzima od onoga koji ga ima.
 *
 * Pokretanje:
 *   npm run obrazlozenja -- --suho              # samo ispiši što bi napravio
 *   npm run obrazlozenja                        # upiši u bazu
 *   npm run obrazlozenja -- --poglavlje=3       # samo jedna cjelina
 *   npm run obrazlozenja -- --sve               # i ondje gdje obrazloženje već postoji
 */
import fs from 'node:fs';
import path from 'node:path';
import { askClaudeJson } from '../lib/claude';
import { retrieve } from '../lib/retrieval';
import { supabaseAdmin } from '../lib/supabase';
import { PRIRUCNIK } from '../lib/prompt';
import { REGISTAR_OBRAZLOZENJA, kljucPitanja, ucitajObrazlozenja } from '../lib/obrazlozenja';

const ARGS = process.argv.slice(2);
const SUHO = ARGS.includes('--suho');
const SVE = ARGS.includes('--sve');
const SAMO_POGLAVLJE = ARGS.find((a) => a.startsWith('--poglavlje='))?.split('=')[1];

/**
 * Autorova obrazloženja mjere 72–130 znakova, jedna rečenica. Model piše nešto
 * razložnije, pa je gornja granica šira — ali se reže na kraju REČENICE, nikad
 * usred riječi, jer odsječen tekst u sučelju izgleda kao kvar.
 */
const NAJVISE_ZNAKOVA = 340;
const ISJECAKA = 6;

/**
 * Kad podloge nema, model umjesto praznog niza zna napisati obrazloženje O SEBI
 * („u isječcima se to ne spominje, pa nema dovoljne podloge"). Studentu to ništa
 * ne znači — pitanje je bolje ostaviti bez obrazloženja nego mu pokazati kako
 * radi dohvat.
 */
const METAGOVOR =
  /isječ|dohvaćen|nema (dovoljne |dovoljno )?podloge|u priloženom tekstu|priloženi tekst|ne mogu potvrditi|na temelju priloženog/i;

/** Skraćuje na zadnju cijelu rečenicu koja stane; ako nijedna ne stane, na riječ. */
function naRecenicu(tekst: string, granica: number): string {
  if (tekst.length <= granica) return tekst;
  const odsjecak = tekst.slice(0, granica + 1);
  const kraj = Math.max(
    odsjecak.lastIndexOf('. '),
    odsjecak.lastIndexOf('! '),
    odsjecak.lastIndexOf('? '),
  );
  if (kraj > granica * 0.5) return odsjecak.slice(0, kraj + 1).trim();
  const razmak = odsjecak.lastIndexOf(' ');
  return (razmak > 0 ? odsjecak.slice(0, razmak) : odsjecak).trim().replace(/[,;:]$/, '') + '…';
}

const OGRADA = `Pišeš obrazloženje uz kviz pitanje za studente, na temelju isječaka izvora ${PRIRUCNIK}.

PRAVILA:
- Radiš isključivo iz priloženih isječaka. Ne dodaješ pojmove, primjere, brojke ni imena kojih u njima nema.
- Obrazlažeš zašto je označeni odgovor točan; ako isječci nose podlogu i za to, u istoj rečenici kaži zašto tipična zamka nije točna.
- Jedna do dvije rečenice, ukupno 150 do 300 znakova — ne dulje. Hrvatski, terminologijom priručnika, mirnim nastavničkim tonom.
- Ne počinji s „Točan odgovor je…" — student već vidi koji je točan. Idi ravno na razlog.
- Ne citiraj stranicu ni poglavlje; sučelje ih ispisuje samo.
- Pišeš studentu, ne o svojem poslu: nikad ne spominji isječke, priloženi tekst, dohvat ni to čega u njima ima ili nema. Ako nečega nema, jednostavno o tome ne pišeš.
- Ako u isječcima NEMA podloge za tvrdnju iz točnog odgovora, vrati prazan niz znakova. Bolje ništa nego izmišljeno.
- Ne koristi navodnike (ni " ni „ ") — razbijaju JSON.

Odgovaraš isključivo validnim JSON-om bez markdown ograda.`;

const SHEMA = {
  type: 'object',
  properties: { obrazlozenje: { type: 'string' } },
  required: ['obrazlozenje'],
} as const;

interface Red {
  id: string;
  pitanje: string;
  odgovori: string[];
  tocan_index: number;
  objasnjenje: string;
  stranica_ref: string;
  poglavlje_id: string;
}

/**
 * Dvostruka pitanja iz banke: isti tekst pitanja u istoj cjelini. Vraća zapise
 * za brisanje i, gdje treba, obrazloženje koje preživjeli zapis nasljeđuje.
 */
function nadjiDvostruke(redovi: Red[]) {
  const skupine = new Map<string, Red[]>();
  for (const r of redovi) {
    const kljuc = `${r.poglavlje_id}|${r.pitanje.trim().toLowerCase()}`;
    skupine.set(kljuc, [...(skupine.get(kljuc) ?? []), r]);
  }

  const zaBrisanje: Red[] = [];
  const naslijedi: { id: string; objasnjenje: string }[] = [];
  for (const skupina of skupine.values()) {
    if (skupina.length < 2) continue;
    // Zapis iz same cjeline ima manji broj stranice od onoga iz Dodataka na
    // kraju knjige; on ostaje jer studenta upućuje na gradivo, ne na banku.
    const poredani = [...skupina].sort(
      (a, b) => (brojStranice(a.stranica_ref) ?? 1e9) - (brojStranice(b.stranica_ref) ?? 1e9),
    );
    const [ostaje, ...visak] = poredani;
    if (!ostaje.objasnjenje?.trim()) {
      const izvor = visak.find((v) => v.objasnjenje?.trim());
      if (izvor) {
        ostaje.objasnjenje = izvor.objasnjenje;
        naslijedi.push({ id: ostaje.id, objasnjenje: izvor.objasnjenje });
      }
    }
    zaBrisanje.push(...visak);
  }
  return { zaBrisanje, naslijedi };
}

function brojStranice(ref: string): number | null {
  const m = /(\d+)/.exec(ref ?? '');
  return m ? Number(m[1]) : null;
}

async function obrazlozi(r: Red, poglavljeId: string): Promise<string> {
  const tocan = r.odgovori[r.tocan_index];
  const isjecci = await retrieve(`${r.pitanje} ${tocan}`, {
    poglavljeId,
    topK: ISJECAKA,
    rerank: false,
  });
  if (isjecci.length === 0) return '';

  const kontekst = isjecci
    .map((c, i) => `[${i + 1}] (str. ${c.stranicaOd}–${c.stranicaDo}) ${c.text}`)
    .join('\n\n');

  const poruka = `ISJEČCI IZ PRIRUČNIKA:
${kontekst}

PITANJE: ${r.pitanje}
PONUĐENI ODGOVORI:
${r.odgovori.map((o, i) => `${i === r.tocan_index ? '→ TOČAN' : '  netočan'}: ${o}`).join('\n')}

Napiši obrazloženje.`;

  const out = await askClaudeJson<{ obrazlozenje: string }>(OGRADA, poruka, 500, undefined, SHEMA);
  const tekst = (out?.obrazlozenje ?? '').trim();
  if (METAGOVOR.test(tekst)) return '';
  return naRecenicu(tekst, NAJVISE_ZNAKOVA);
}

async function main() {
  const sb = supabaseAdmin();

  const { data: poglavlja, error: pogErr } = await sb
    .from('poglavlja')
    .select('id, broj, naslov')
    .order('broj');
  if (pogErr) throw new Error(`Dohvat poglavlja: ${pogErr.message}`);
  const brojPoglavlja = new Map((poglavlja ?? []).map((p) => [p.id, p.broj]));

  const { data, error } = await sb
    .from('kviz_pitanja')
    .select('id, pitanje, odgovori, tocan_index, objasnjenje, stranica_ref, poglavlje_id');
  if (error) throw new Error(`Dohvat pitanja: ${error.message}`);
  const svi = (data ?? []) as Red[];

  // 1) Dvostruki unosi — prvo oni, da se ne piše obrazloženje za zapis koji ide van.
  const { zaBrisanje, naslijedi } = nadjiDvostruke(svi);
  if (zaBrisanje.length) {
    console.log(`[obrazlozenja] Dvostrukih zapisa za uklanjanje: ${zaBrisanje.length}`);
    for (const r of zaBrisanje) {
      console.log(`  − cjelina ${brojPoglavlja.get(r.poglavlje_id)} · ${r.stranica_ref} · ${r.pitanje.slice(0, 60)}`);
    }
    if (!SUHO) {
      for (const n of naslijedi) {
        const { error: e } = await sb
          .from('kviz_pitanja')
          .update({ objasnjenje: n.objasnjenje })
          .eq('id', n.id);
        if (e) throw new Error(`Prijenos obrazloženja: ${e.message}`);
      }
      const { error: e } = await sb
        .from('kviz_pitanja')
        .delete()
        .in('id', zaBrisanje.map((r) => r.id));
      if (e) throw new Error(`Brisanje dvostrukih: ${e.message}`);
    }
  }

  const izbaceni = new Set(zaBrisanje.map((r) => r.id));
  const kandidati = svi
    .filter((r) => !izbaceni.has(r.id))
    .filter((r) => SVE || !r.objasnjenje?.trim())
    .filter((r) => !SAMO_POGLAVLJE || String(brojPoglavlja.get(r.poglavlje_id)) === SAMO_POGLAVLJE)
    .sort(
      (a, b) =>
        (brojPoglavlja.get(a.poglavlje_id) ?? 0) - (brojPoglavlja.get(b.poglavlje_id) ?? 0),
    );

  console.log(`[obrazlozenja] Pitanja za obradu: ${kandidati.length}${SUHO ? ' (suho)' : ''}`);

  // Registar iz repozitorija: već dopisano obrazloženje ne plaća se drugi put,
  // i preživljava ponovni `npm run nastavno`.
  const registar = ucitajObrazlozenja();

  let upisano = 0;
  let prazno = 0;
  let izRegistra = 0;
  for (const r of kandidati) {
    const zapamceno = registar.get(kljucPitanja(r.pitanje));
    const tekst = zapamceno && !SVE ? zapamceno : await obrazlozi(r, r.poglavlje_id);
    if (zapamceno && tekst === zapamceno) izRegistra += 1;
    const oznaka = `  ${String(brojPoglavlja.get(r.poglavlje_id)).padStart(2)}. ${r.pitanje.slice(0, 52).padEnd(53)}`;
    if (!tekst) {
      prazno += 1;
      console.log(`${oznaka} — nema podloge u isječcima, preskačem`);
      continue;
    }
    console.log(`${oznaka} ${tekst}`);
    if (!SUHO) {
      const { error: e } = await sb
        .from('kviz_pitanja')
        .update({ objasnjenje: tekst })
        .eq('id', r.id);
      if (e) throw new Error(`Upis obrazloženja: ${e.message}`);
    }
    registar.set(kljucPitanja(r.pitanje), tekst);
    upisano += 1;
  }

  // Sav dopisani tekst ide i u repozitorij — baza je pogonsko gorivo, izvor je git.
  if (!SUHO && upisano > 0) {
    const svaPitanja = new Map(svi.map((r) => [kljucPitanja(r.pitanje), r.pitanje]));
    const zapisi = [...registar.entries()]
      .map(([k, obrazlozenje]) => ({ pitanje: svaPitanja.get(k) ?? k, obrazlozenje }))
      .sort((a, b) => a.pitanje.localeCompare(b.pitanje, 'hr'));
    const put = path.join(process.cwd(), REGISTAR_OBRAZLOZENJA);
    fs.mkdirSync(path.dirname(put), { recursive: true });
    fs.writeFileSync(
      put,
      JSON.stringify(
        {
          _opis:
            'Obrazloženja uz kviz pitanja koja ih u priručniku nemaju, dopisana skriptom npm run obrazlozenja iz teksta priručnika. Ključ je tekst pitanja.',
          obrazlozenja: zapisi,
        },
        null,
        2,
      ) + '\n',
      'utf8',
    );
    console.log(`[obrazlozenja] Registar osvježen → ${REGISTAR_OBRAZLOZENJA} (${zapisi.length})`);
  }

  console.log(
    `\n[obrazlozenja] ${SUHO ? 'Bilo bi upisano' : 'Upisano'}: ${upisano}` +
      (izRegistra ? ` (iz registra: ${izRegistra})` : '') +
      (prazno ? ` · bez podloge: ${prazno}` : '') +
      (zaBrisanje.length ? ` · uklonjeno dvostrukih: ${zaBrisanje.length}` : ''),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
