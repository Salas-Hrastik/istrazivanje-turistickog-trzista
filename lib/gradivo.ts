/**
 * Koji odjeljci poglavlja nose GRADIVO, a koji su aparat knjige.
 *
 * Nasumičan odabir odjeljka koristi se na dva mjesta — usmena vježba i završna
 * provjera — i oba su padala na istom: „Uvod", „Ishodi učenja", „Ključni
 * pojmovi", „Literatura" i „Preporučeno daljnje čitanje" nemaju dovoljno
 * ingestiranog teksta da dohvat prijeđe prag, pa pitanje ne nastane. Njih je pet
 * od trinaest po poglavlju, pa je svaki treći do četvrti pokušaj završavao
 * porukom da sadržaj nije ingestiran — iako jest.
 *
 * Uz to iz tih odjeljaka ionako nema smisla ispitivati: pitanje iz popisa
 * literature ne provjerava znanje, a iz interaktivne provjere samo bi ponovilo
 * pitanje koje student već ima u kvizu.
 *
 * Pravilo stoji ovdje, a ne u pojedinoj ruti, da se dvije rute ne mogu ponovno
 * razići.
 */
const NIJE_GRADIVO =
  /^(uvod|ključni pojmovi|ishodi učenja|preporučeno daljnje čitanje|literatura|interaktivna provjera znanja|praktični zadatak)/i;

export interface OdjeljakIzbor {
  oznaka?: string | null;
  naslov?: string | null;
}

/** Odjeljci iz kojih se smije ispitivati. */
export function odjeljciGradiva<T extends OdjeljakIzbor>(odjeljci: T[] | null | undefined): T[] {
  return (odjeljci ?? []).filter((o) => !NIJE_GRADIVO.test(o.naslov ?? ''));
}

/**
 * Nasumičan odjeljak s gradivom, ili null ako ih poglavlje nema — tada
 * pozivatelj pada natrag na naslov cjeline, koji u dohvatu uvijek prolazi.
 */
export function nasumicniOdjeljakGradiva<T extends OdjeljakIzbor>(
  odjeljci: T[] | null | undefined,
): T | null {
  const gradivo = odjeljciGradiva(odjeljci);
  if (gradivo.length === 0) return null;
  return gradivo[Math.floor(Math.random() * gradivo.length)];
}
