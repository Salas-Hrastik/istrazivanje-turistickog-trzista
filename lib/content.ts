import fs from 'node:fs';
import path from 'node:path';
import { supabaseAdmin } from './supabase';
import { DODACI_BROJ } from './prirucnik';

export interface Odjeljak {
  id: string;
  poglavlje_id: string;
  broj: number;
  oznaka: string;
  naslov: string;
  stranica_od: number;
  stranica_do: number;
  redoslijed: number;
}

export interface PoglavljeSaOdjeljcima {
  id: string;
  broj: number;
  naslov: string;
  dio: string;
  stranica_od: number;
  stranica_do: number;
  odjeljci: Odjeljak[];
}

export interface NapredakStanje {
  posjeceno: boolean;
  zavrseno: boolean;
}

/** Cijela karta kolegija: poglavlja (nastavne cjeline) s pripadajućim odjeljcima. */
export async function getPoglavlja(): Promise<PoglavljeSaOdjeljcima[]> {
  const admin = supabaseAdmin();
  const [{ data: poglavlja, error: e1 }, { data: odjeljci, error: e2 }] = await Promise.all([
    admin.from('poglavlja').select('id, broj, naslov, dio, stranica_od, stranica_do').order('broj'),
    admin
      .from('odjeljci')
      .select('id, poglavlje_id, broj, oznaka, naslov, stranica_od, stranica_do, redoslijed')
      .order('redoslijed'),
  ]);
  // Greška upita se NE guta u prazan popis: neispravan ključ tada izgleda
  // jednako kao prazna baza, pa se pri postavljanju traži na krivom mjestu.
  if (e1) throw new Error(`Dohvat poglavlja nije uspio: ${e1.message}`);
  if (!poglavlja) return [];
  if (e2) return poredakKolegija(poglavlja).map((p) => ({ ...p, odjeljci: [] }));

  return poredakKolegija(poglavlja).map((p) => ({
    ...p,
    odjeljci: (odjeljci ?? []).filter((o) => o.poglavlje_id === p.id),
  }));
}

/**
 * Redoslijed cjelina na naslovnici i u navigaciji prethodna/sljedeća: po broju,
 * ali Dodaci (banka pitanja, prilozi, literatura) uvijek na kraju — i kad se
 * kolegiju doda cjelina s većim brojem (npr. 9 · TOMAS, data/cjeline/).
 */
function poredakKolegija<T extends { broj: number }>(poglavlja: T[]): T[] {
  return [...poglavlja].sort(
    (a, b) => Number(a.broj === DODACI_BROJ) - Number(b.broj === DODACI_BROJ) || a.broj - b.broj,
  );
}

/**
 * Sve što stranica cjeline treba. Studentima se prikazuju samo ODOBRENI ciljevi
 * i kartice — nacrti pripremljeni iz teksta priručnika čekaju nastavnika.
 */
export async function getCjelina(broj: number) {
  const admin = supabaseAdmin();
  const { data: poglavlje, error } = await admin
    .from('poglavlja')
    .select('id, broj, naslov, dio, opis, stranica_od, stranica_do, sazetak_md')
    .eq('broj', broj)
    .single();
  if (error || !poglavlje) return null;

  // Paralelno — baza je udaljena, pa sekvencijalni upiti množe mrežnu latenciju.
  const [{ data: odjeljci }, { data: ciljevi }, { data: kartice }, { data: mediji }, { count }] =
    await Promise.all([
      admin
        .from('odjeljci')
        .select('id, broj, oznaka, naslov, stranica_od, stranica_do')
        .eq('poglavlje_id', poglavlje.id)
        .order('redoslijed'),
      admin
        .from('ciljevi_ucenja')
        .select('id, tekst, kognitivna_razina, stranica')
        .eq('poglavlje_id', poglavlje.id)
        .eq('odobreno', true)
        .order('redoslijed'),
      admin
        .from('kartice')
        .select('id, pojam, definicija, stranica_ref')
        .eq('poglavlje_id', poglavlje.id)
        .eq('odobreno', true)
        .order('redoslijed'),
      admin
        .from('mediji')
        .select('id, tip, naslov, url, trajanje_s')
        .eq('poglavlje_id', poglavlje.id)
        .order('redoslijed'),
      admin
        .from('kviz_pitanja')
        .select('*', { count: 'exact', head: true })
        .eq('poglavlje_id', poglavlje.id)
        .eq('odobreno', true),
    ]);

  return {
    poglavlje,
    odjeljci: odjeljci ?? [],
    ciljevi: ciljevi ?? [],
    kartice: kartice ?? [],
    mediji: mediji ?? [],
    slajdovi: ucitajSlajdove(broj),
    brojPitanja: count ?? 0,
  };
}

export interface Slajd {
  broj: number;
  naslov: string;
  tumacenje: string;
}

/** Tumačenja slajdova jedne prezentacije; `prezentacija` = naslov medija. */
export interface SetSlajdova {
  prezentacija: string;
  slajdovi: Slajd[];
}

/**
 * Tumačenja slajdova stoje kao podatak u repozitoriju (kao data/sadrzaj.json),
 * a ne u bazi — vežu se uz konkretnu datoteku prezentacije, pa ih je korisno
 * verzionirati zajedno s kodom. Pripremaju se skriptom `npm run slajdovi`.
 *
 * Cjelina može imati više prezentacija: uz poglavlje-N.json čitaju se i
 * poglavlje-N-<oznaka>.json, a svaki se set uz medij veže po naslovu.
 */
function ucitajSlajdove(broj: number): SetSlajdova[] {
  try {
    const mapa = path.join(process.cwd(), 'data', 'slajdovi');
    if (!fs.existsSync(mapa)) return [];
    const uzorak = new RegExp(`^poglavlje-${broj}(-[\\w-]+)?\\.json$`);
    return fs
      .readdirSync(mapa)
      .filter((ime) => uzorak.test(ime))
      .sort()
      .map((ime) => {
        const json = JSON.parse(fs.readFileSync(path.join(mapa, ime), 'utf8')) as {
          prezentacija?: string;
          slajdovi?: Slajd[];
        };
        return { prezentacija: json.prezentacija ?? '', slajdovi: json.slajdovi ?? [] };
      })
      .filter((s) => s.slajdovi.length > 0);
  } catch {
    return [];
  }
}

export async function getNapredakMap(userId: string): Promise<Map<string, NapredakStanje>> {
  const admin = supabaseAdmin();
  const { data } = await admin
    .from('napredak')
    .select('poglavlje_id, posjeceno, zavrseno')
    .eq('user_id', userId);
  const map = new Map<string, NapredakStanje>();
  for (const row of data ?? []) {
    map.set(row.poglavlje_id, { posjeceno: row.posjeceno, zavrseno: row.zavrseno });
  }
  return map;
}

/** Popis dopunskih izvora (izvora koje priručnik sam navodi). */
export async function getDopunskiIzvori() {
  const admin = supabaseAdmin();
  const { data } = await admin
    .from('izvori')
    .select('id, naslov, autor, godina, napomena, url, ukupno_stranica')
    .eq('vrsta', 'dopunski')
    .order('naslov');
  return data ?? [];
}
