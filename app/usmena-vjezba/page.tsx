import Link from 'next/link';
import { getPoglavlja } from '@/lib/content';
import OralPracticePicker from '@/components/OralPracticePicker';

export const dynamic = 'force-dynamic';

export default async function UsmenaVjezbaPage() {
  // Baza može biti nedostupna prije postavljanja; stranica tada ostaje prazna
  // umjesto da padne na 500.
  const poglavlja = await getPoglavlja().catch(() => []);

  return (
    <div className="page page-usmena">
      <p className="mrvice-redak">
        <Link href="/">← Naslovnica</Link>
      </p>
      <h1>Usmena vježba</h1>
      <p className="usmena-uvod">
        Vježba za usmeni ispit <strong>bez službenog ocjenjivanja</strong>. Asistent postavlja jedno
        pitanje iz odabranog poglavlja, vi odgovarate glasom (ili tipkanjem), potvrdite transkript i
        dobijete formativnu povratnu informaciju: što je točno, što nedostaje, što je pogrešno, uz
        savjete i idealan sažeti odgovor s citiranim stranicama priručnika.
      </p>
      <p className="usmena-privatnost">
        🔒 Snimka se ne pohranjuje — čuva se samo transkript i tehničke metrike.
      </p>

      {poglavlja.length === 0 ? (
        <p>Sadržaj kolegija još nije učitan.</p>
      ) : (
        <OralPracticePicker
          poglavlja={poglavlja.map((p) => ({
            broj: p.broj,
            naslov: p.naslov,
            brojOdjeljaka: p.odjeljci.length,
          }))}
        />
      )}
    </div>
  );
}
