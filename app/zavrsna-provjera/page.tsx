import Link from 'next/link';
import ZavrsniUsmeni from '@/components/ZavrsniUsmeni';

export const dynamic = 'force-dynamic';

export default function ZavrsnaProvjeraPage() {
  return (
    <div className="page page-zavrsna">
      <p className="mrvice-redak">
        <Link href="/">← Naslovnica</Link>
      </p>
      <h1>Završna provjera znanja</h1>
      <p className="zavrsna-uvod">
        Usmena provjera pred asistentom, po uzoru na usmeni ispit: pet pitanja iz cijelog
        priručnika, izgovorenih naglas, uz potpitanje ondje gdje odgovor zapne. Rezultat je
        informativan — nije službena ocjena.
      </p>
      <ZavrsniUsmeni />
    </div>
  );
}
