/**
 * Registar obrazloženja uz kviz pitanja koja ih u priručniku nemaju.
 *
 * Autor je obrazloženje napisao uz manji dio pitanja. Ostala su dopisana
 * skriptom `npm run obrazlozenja`, strogo iz teksta priručnika. Da to ne živi
 * samo u bazi — gdje bi ga prvo ponovno pokretanje `npm run nastavno` pregazilo
 * — sprema se ovamo, u repozitorij, jednako kao tumačenja slajdova.
 *
 * Ključ je normalizirani tekst pitanja, ne id: id se pri ponovnom uvozu mijenja,
 * a tekst pitanja je ono što je stalno.
 */
import fs from 'node:fs';
import path from 'node:path';

export const REGISTAR_OBRAZLOZENJA = path.join('data', 'obrazlozenja-kviza.json');

export interface ZapisObrazlozenja {
  pitanje: string;
  obrazlozenje: string;
}

/** Razmaci i velika slova se razlikuju među izvozima; tekst pitanja ne. */
export function kljucPitanja(pitanje: string): string {
  return pitanje.trim().replace(/\s+/g, ' ').toLocaleLowerCase('hr');
}

export function ucitajObrazlozenja(korijen = process.cwd()): Map<string, string> {
  try {
    const sirovo = fs.readFileSync(path.join(korijen, REGISTAR_OBRAZLOZENJA), 'utf8');
    const json = JSON.parse(sirovo) as { obrazlozenja?: ZapisObrazlozenja[] };
    return new Map(
      (json.obrazlozenja ?? [])
        .filter((z) => z.pitanje && z.obrazlozenje)
        .map((z) => [kljucPitanja(z.pitanje), z.obrazlozenje]),
    );
  } catch {
    return new Map();
  }
}
