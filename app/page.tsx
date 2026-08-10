import Link from 'next/link';
import { config } from '@/lib/config';
import { dohvatiKorisnika } from '@/lib/auth';
import { getPoglavlja, getNapredakMap, type NapredakStanje } from '@/lib/content';
import VodicModal from '@/components/VodicModal';
import ZivotopisModal from '@/components/ZivotopisModal';

export const dynamic = 'force-dynamic';

export default async function NaslovnicaPage() {
  // Nova instanca se pokreće PRIJE nego što baza postoji: bez `.env.local`
  // `supabaseAdmin()` baca, i naslovnica bi bila prazan 500 umjesto upute.
  let poglavlja: Awaited<ReturnType<typeof getPoglavlja>> = [];
  let bazaDostupna = true;
  try {
    poglavlja = await getPoglavlja();
  } catch (e) {
    // Ispis ide u Vercelov Runtime log — ondje piše je li ključ odbijen ili
    // varijabla nedostaje, umjesto da se sve svede na „nema sadržaja".
    console.error('[naslovnica] baza nedostupna:', e);
    bazaDostupna = false;
  }
  const korisnik = await dohvatiKorisnika().catch(() => null);
  const napredak: Map<string, NapredakStanje> = korisnik
    ? await getNapredakMap(korisnik.id).catch(() => new Map<string, NapredakStanje>())
    : new Map();

  if (poglavlja.length === 0) {
    return (
      <div className="page">
        <h1>Sadržaj kolegija još nije učitan</h1>
        {bazaDostupna ? (
          <p>
            Nastavnik treba pokrenuti punjenje sadržaja: <code>npm run struktura</code> →{' '}
            <code>npm run ingest</code> nakon postavljanja Supabase projekta i sheme iz{' '}
            <code>supabase/schema.sql</code>.
          </p>
        ) : (
          <p>
            Baza još nije povezana. Popunite <code>.env.local</code> prema{' '}
            <code>.env.example</code> i izvršite <code>supabase/schema.sql</code> u svojem Supabase
            projektu, pa pokrenite <code>npm run struktura</code> i <code>npm run ingest</code>.
          </p>
        )}
      </div>
    );
  }

  const zavrsenih = poglavlja.filter((p) => napredak.get(p.id)?.zavrseno).length;
  const ukupnoPostotak = Math.round((zavrsenih / poglavlja.length) * 100);
  const prva = poglavlja[0];
  const sljedeca = poglavlja.find((p) => !napredak.get(p.id)?.zavrseno) ?? prva;

  // Cjeline se na naslovnici prikazuju grupirane po dijelovima priručnika.
  const dijelovi: { naslov: string; poglavlja: typeof poglavlja }[] = [];
  for (const pog of poglavlja) {
    const zadnji = dijelovi[dijelovi.length - 1];
    if (zadnji && zadnji.naslov === pog.dio) zadnji.poglavlja.push(pog);
    else dijelovi.push({ naslov: pog.dio, poglavlja: [pog] });
  }

  return (
    <div className="page page-naslovnica">
      <section className="hero">
        <div className="hero-tekst">
          <p className="hero-institucija">
            {config.ustanova} · {config.studij}
          </p>
          <h1 className="hero-naslov">Istraživanje turističkog tržišta</h1>
          <p className="hero-podnaslov">
            Od definiranja problema do odluke — metodologija istraživanja u turizmu
          </p>
          {config.autorPrirucnika && (
            <p className="hero-autor">
              <ZivotopisModal ime={config.autorPrirucnika} />
            </p>
          )}
          <div className="hero-opis">
            Učenje po nastavnim cjelinama — ciljevi, sažetak, kartice, mediji i kviz, uz AI
            asistenta koji svaki odgovor <strong>citira iz priručnika</strong> (poglavlje i stranica).
          </div>
          <div className="hero-gumbi">
            <Link href={`/cjelina/${prva.broj}`} className="hero-gumb hero-gumb-bijeli">
              Kreni od početka
            </Link>
            <Link href={`/cjelina/${sljedeca.broj}`} className="hero-gumb hero-gumb-obrub">
              Nastavi učenje →
            </Link>
            <VodicModal />
          </div>
        </div>
        {/*
          Korice u slijepom tisku: nema ilustracije, sve nosi reljef i slog.
          Hrbat, udubljeni okvir i motiv rastera izvedeni su parom sjena —
          tamna gore, svijetla dolje — kako otisak izgleda na pravom platnu.
          Kad naslovnica knjige bude gotova, ovdje dolazi <img> (vidi
          docs/PREDLOZAK-NOVE-KNJIGE.md §8).
        */}
        <div className="hero-korice hero-korice-nacrt" aria-hidden="true">
          <span className="korice-hrbat" />
          <div className="korice-ploha">
            <div className="korice-vrh">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/baltazar-logo.png" alt="" className="korice-znak" />
              <span className="korice-izdavac">
                Veleučilište
                <br />
                Baltazar Zaprešić
              </span>
            </div>
            <div className="korice-sredina">
              <span className="korice-oznaka">Veleučilišni priručnik</span>
              <span className="korice-crta" />
              <span className="korice-naslov">Istraživanje turističkog tržišta</span>
            </div>
            <div className="korice-dno">
              <span className="korice-crta korice-crta-tanka" />
              <span className="korice-autor">{config.autorPrirucnika || config.studij}</span>
            </div>
          </div>
        </div>
      </section>

      <section className="napredak-traka-sekcija">
        <div className="put-zaglavlje">
          <h2>Tvoj put kroz priručnik</h2>
          <p className="napredak-tekst">
            {zavrsenih}/{poglavlja.length} cjelina <strong>{ukupnoPostotak}%</strong>
          </p>
        </div>
        <div className="napredak-traka">
          <div className="napredak-traka-ispuna" style={{ width: `${ukupnoPostotak}%` }} />
        </div>
      </section>

      {dijelovi.map((dio) => (
        <section key={dio.naslov} className="dio-sekcija">
          <h2 className="dio-naslov">{dio.naslov}</h2>
          <div className="poglavlja-lista">
            {dio.poglavlja.map((pog) => {
              const stanje = napredak.get(pog.id);
              return (
                <Link
                  key={pog.id}
                  href={`/cjelina/${pog.broj}`}
                  className={`cjelina-kartica ${stanje?.zavrseno ? 'cjelina-zavrsena' : ''}`}
                >
                  <div className="cjelina-vrh">
                    <span className="cjelina-broj">{pog.broj}</span>
                    {stanje?.zavrseno ? (
                      <span className="cjelina-znak" title="Pregledano">
                        ✓
                      </span>
                    ) : stanje?.posjeceno ? (
                      <span className="cjelina-znak cjelina-znak-tih" title="Započeto">
                        ·
                      </span>
                    ) : null}
                  </div>
                  <h3>{pog.naslov}</h3>
                  <p className="cjelina-meta">
                    str. {pog.stranica_od}–{pog.stranica_do} · {pog.odjeljci.length} odjeljaka
                  </p>
                  <ul className="odjeljci-pregled">
                    {pog.odjeljci.slice(0, 4).map((o) => (
                      <li key={o.id}>
                        {o.oznaka ? `${o.oznaka} ` : ''}
                        {o.naslov}
                      </li>
                    ))}
                    {pog.odjeljci.length > 4 && (
                      <li className="odjeljci-jos">+ još {pog.odjeljci.length - 4}</li>
                    )}
                  </ul>
                </Link>
              );
            })}
          </div>
        </section>
      ))}

      {/*
        Provjere stoje na kraju sadržaja jer su zadnji korak kroz priručnik.
        Dok su bile samo u zaglavlju, do njih se dolazilo tek ako se zna da
        postoje — a sadržaj je mjesto na koje student gleda.
      */}
      <section className="dio-sekcija">
        <h2 className="dio-naslov">Provjera znanja</h2>
        <div className="poglavlja-lista">
          <Link href="/usmena-vjezba" className="cjelina-kartica cjelina-kartica-provjera">
            <div className="cjelina-vrh">
              <span className="cjelina-znak-velik" aria-hidden="true">
                🎙️
              </span>
            </div>
            <h3>Usmena vježba</h3>
            <p className="cjelina-meta">Jedno pitanje iz odabrane cjeline · bez ocjenjivanja</p>
            <ul className="odjeljci-pregled">
              <li>Asistent pita, vi odgovarate glasom</li>
              <li>Povratna informacija s citiranim stranicama</li>
              <li>Ponavljajte koliko god puta želite</li>
            </ul>
          </Link>

          <Link href="/zavrsna-provjera" className="cjelina-kartica cjelina-kartica-provjera">
            <div className="cjelina-vrh">
              <span className="cjelina-znak-velik" aria-hidden="true">
                🎓
              </span>
            </div>
            <h3>Završna provjera znanja</h3>
            <p className="cjelina-meta">Usmeni ispit · pet pitanja iz cijelog priručnika</p>
            <ul className="odjeljci-pregled">
              <li>Pitanja iz pet različitih cjelina, nasumično</li>
              <li>Potpitanje ondje gdje odgovor zapne</li>
              <li>Zaključna riječ i preporuke što ponoviti</li>
            </ul>
          </Link>
        </div>
      </section>
    </div>
  );
}
