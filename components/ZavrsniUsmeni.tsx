'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * ZAVRŠNA USMENA PROVJERA ZNANJA.
 *
 * Pet pitanja, svako iz druge nastavne cjeline, odabrane nasumično. Asistent
 * pitanje IZGOVARA, čeka odgovor, i ako procijeni da student zapinje, postavlja
 * jedno kontekstualno potpitanje prije nego što krene dalje. Na kraju daje
 * zaključnu riječ — bez brojčane ocjene, jer ovo nije službeni ispit.
 *
 * Mehanika govora preuzeta je iz usmene vježbe koja je već u pogonu: snimanje
 * preko MediaRecordera, transkripcija na /api/transkript, sinteza na /api/govor
 * uz red rečenica da nema tišine između njih.
 *
 * PRIVATNOST: snimka putuje samo do transkripcije i nigdje se ne pohranjuje;
 * dalje ide isključivo prepoznati tekst.
 */

interface Citat {
  poglavlje: string;
  stranice: string;
}

interface Pitanje {
  redni: number;
  poglavljeBroj: number;
  opseg: string;
  pitanje: string;
  kljucneTocke: string[];
  citati: Citat[];
}

type Ocjena = 'dobro' | 'djelomicno' | 'slabo';

interface Odgovoreno {
  opseg: string;
  pitanje: string;
  ocjena: Ocjena;
  pokrio: string[];
  izostalo: string[];
  /** Sve što je student rekao na to pitanje, uključujući odgovor na potpitanje. */
  transkripti: string[];
}

interface Replika {
  autor: 'ispitivac' | 'student';
  tekst: string;
  /** Oznaka koja se prikazuje uz repliku ispitivača (npr. „Potpitanje"). */
  oznaka?: string;
}

type Faza = 'pocetak' | 'priprema' | 'ispit' | 'zakljucak' | 'gotovo';
type Radnja = '' | 'govorim' | 'transkribiram' | 'procjenjujem';

const OZNAKA_OCJENE: Record<Ocjena, string> = {
  dobro: 'Pokriveno',
  djelomicno: 'Djelomično',
  slabo: 'Nedostatno',
};

export default function ZavrsniUsmeni() {
  const [faza, setFaza] = useState<Faza>('pocetak');
  const [pitanja, setPitanja] = useState<Pitanje[]>([]);
  const [indeks, setIndeks] = useState(0);
  const [replike, setReplike] = useState<Replika[]>([]);
  const [odgovoreno, setOdgovoreno] = useState<Odgovoreno[]>([]);
  const [transkript, setTranskript] = useState('');
  const [snima, setSnima] = useState(false);
  const [radnja, setRadnja] = useState<Radnja>('');
  const [greska, setGreska] = useState<string | null>(null);
  const [zakljucak, setZakljucak] = useState<{ tekst: string; preporuke: string[] } | null>(null);

  /** Je li na tekućem pitanju potpitanje već postavljeno (najviše jedno). */
  const [uPotpitanju, setUPotpitanju] = useState(false);
  const potpitanjeVecRef = useRef(false);
  /** Sve što je student izgovorio na tekućem pitanju. */
  const transkriptiRef = useRef<string[]>([]);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const dijeloviRef = useRef<Blob[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const tijekRef = useRef<HTMLDivElement | null>(null);
  const redRef = useRef<string[]>([]);
  const sviraRef = useRef(false);

  // Mikrofon i reprodukcija se otpuštaju i kad korisnik napusti stranicu.
  useEffect(
    () => () => {
      recorderRef.current?.stream.getTracks().forEach((t) => t.stop());
      audioRef.current?.pause();
    },
    [],
  );

  useEffect(() => {
    const el = tijekRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [replike, radnja]);

  // --- Govor ---------------------------------------------------------------

  const dohvatiZvuk = useCallback(async (tekst: string): Promise<string | null> => {
    try {
      const res = await fetch('/api/govor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tekst: ocistiZaGovor(tekst) }),
      });
      if (!res.ok) return null;
      return URL.createObjectURL(await res.blob());
    } catch {
      return null;
    }
  }, []);

  /** Izgovara red rečenica i vraća se tek kad je sve izgovoreno. */
  const pustiRed = useCallback(async () => {
    if (sviraRef.current) return;
    sviraRef.current = true;
    setRadnja('govorim');

    // Sinteza sljedeće rečenice teče usporedo s reprodukcijom tekuće.
    let sljedeci: Promise<string | null> | null = null;
    while (redRef.current.length > 0) {
      const tekst = redRef.current.shift()!;
      const url = sljedeci ? await sljedeci : await dohvatiZvuk(tekst);
      sljedeci = redRef.current.length > 0 ? dohvatiZvuk(redRef.current[0]) : null;
      if (!url) continue;

      const audio = new Audio(url);
      audioRef.current = audio;
      await new Promise<void>((resolve) => {
        audio.onended = () => {
          URL.revokeObjectURL(url);
          resolve();
        };
        audio.onerror = () => resolve();
        void audio.play().catch(() => resolve());
      });
    }

    sviraRef.current = false;
    setRadnja('');
  }, [dohvatiZvuk]);

  /** Izgovori cijeli tekst i pričekaj da se dovrši, pa tek onda dalje. */
  const izgovori = useCallback(
    async (tekst: string) => {
      redRef.current.push(...naRecenice(tekst));
      await pustiRed();
    },
    [pustiRed],
  );

  // --- Tijek ispita --------------------------------------------------------

  const postaviPitanje = useCallback(
    async (p: Pitanje) => {
      potpitanjeVecRef.current = false;
      transkriptiRef.current = [];
      setUPotpitanju(false);
      setTranskript('');
      const uvod = `${p.redni}. pitanje. ${p.pitanje}`;
      setReplike((r) => [...r, { autor: 'ispitivac', tekst: p.pitanje, oznaka: `${p.redni}. pitanje` }]);
      await izgovori(uvod);
    },
    [izgovori],
  );

  const pokreni = useCallback(async () => {
    setGreska(null);
    setFaza('priprema');
    try {
      const res = await fetch('/api/zavrsni/pitanja');
      const data = await res.json();
      if (!res.ok || !data.pitanja?.length) {
        setGreska(data.greska ?? 'Provjeru trenutačno nije moguće pripremiti.');
        setFaza('pocetak');
        return;
      }
      const lista = data.pitanja as Pitanje[];
      setPitanja(lista);
      setIndeks(0);
      setFaza('ispit');

      const pozdrav = `Dobar dan. Ovo je završna usmena provjera znanja. Postavit ću vam ${lista.length} pitanja iz cijelog priručnika. Odgovarajte svojim riječima, bez žurbe.`;
      setReplike([{ autor: 'ispitivac', tekst: pozdrav }]);
      await izgovori(pozdrav);
      await postaviPitanje(lista[0]);
    } catch {
      setGreska('Provjeru trenutačno nije moguće pripremiti. Pokušajte ponovno.');
      setFaza('pocetak');
    }
  }, [izgovori, postaviPitanje]);

  const zavrsi = useCallback(
    async (svi: Odgovoreno[]) => {
      setFaza('zakljucak');
      try {
        const res = await fetch('/api/zavrsni/zakljucak', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            stavke: svi.map((o) => ({
              opseg: o.opseg,
              pitanje: o.pitanje,
              ocjena: o.ocjena,
              pokrio: o.pokrio,
              izostalo: o.izostalo,
            })),
          }),
        });
        const data = await res.json();
        const tekst: string = data.zakljucak ?? 'Time smo završili provjeru.';
        setZakljucak({ tekst, preporuke: data.preporuke ?? [] });
        setReplike((r) => [...r, { autor: 'ispitivac', tekst, oznaka: 'Zaključak' }]);
        await izgovori(tekst);
      } catch {
        setGreska('Zaključak nije dohvaćen, ali su vaši odgovori procijenjeni.');
      } finally {
        setFaza('gotovo');
      }
    },
    [izgovori],
  );

  /** Šalje potvrđeni transkript na procjenu i vodi ispit dalje. */
  const posalji = useCallback(async () => {
    const tekst = transkript.trim();
    const p = pitanja[indeks];
    if (!tekst || !p) return;

    setReplike((r) => [...r, { autor: 'student', tekst }]);
    transkriptiRef.current.push(tekst);
    setTranskript('');
    setRadnja('procjenjujem');

    try {
      const res = await fetch('/api/zavrsni/ocijeni', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          poglavljeBroj: p.poglavljeBroj,
          pitanje: p.pitanje,
          kljucneTocke: p.kljucneTocke,
          transkript: tekst,
          potpitanjeVec: potpitanjeVecRef.current,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setGreska(data.greska ?? 'Procjena nije uspjela.');
        setRadnja('');
        return;
      }

      const reakcija: string = data.reakcija ?? '';
      const potpitanje: string = (data.potpitanje ?? '').trim();

      if (potpitanje && !potpitanjeVecRef.current) {
        // Student zapinje — asistent pomaže i ostaje na istom pitanju.
        potpitanjeVecRef.current = true;
        setUPotpitanju(true);
        setReplike((r) => [
          ...r,
          { autor: 'ispitivac', tekst: `${reakcija} ${potpitanje}`.trim(), oznaka: 'Potpitanje' },
        ]);
        setRadnja('');
        await izgovori(`${reakcija} ${potpitanje}`);
        return;
      }

      const stavka: Odgovoreno = {
        opseg: p.opseg,
        pitanje: p.pitanje,
        ocjena: (data.ocjena ?? 'djelomicno') as Ocjena,
        pokrio: data.pokrio ?? [],
        izostalo: data.izostalo ?? [],
        transkripti: [...transkriptiRef.current],
      };
      const svi = [...odgovoreno, stavka];
      setOdgovoreno(svi);
      setReplike((r) => [...r, { autor: 'ispitivac', tekst: reakcija }]);
      setRadnja('');
      await izgovori(reakcija);

      const sljedeci = indeks + 1;
      if (sljedeci < pitanja.length) {
        setIndeks(sljedeci);
        await postaviPitanje(pitanja[sljedeci]);
      } else {
        await zavrsi(svi);
      }
    } catch {
      setGreska('Procjena nije uspjela. Pokušajte poslati odgovor ponovno.');
      setRadnja('');
    }
  }, [transkript, pitanja, indeks, odgovoreno, izgovori, postaviPitanje, zavrsi]);

  // --- Snimanje ------------------------------------------------------------

  async function pocniSnimanje() {
    setGreska(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      dijeloviRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) dijeloviRef.current.push(e.data);
      };
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        await transkribiraj(new Blob(dijeloviRef.current, { type: rec.mimeType || 'audio/webm' }));
      };
      recorderRef.current = rec;
      rec.start();
      setSnima(true);
    } catch {
      setGreska('Pristup mikrofonu nije odobren. Odgovor možete i upisati — provjera je ista.');
    }
  }

  function zaustaviSnimanje() {
    recorderRef.current?.stop();
    setSnima(false);
  }

  /** Snimka ide izravno na transkripciju i nigdje se ne pohranjuje. */
  async function transkribiraj(blob: Blob) {
    setRadnja('transkribiram');
    try {
      const forma = new FormData();
      forma.append('audio', blob, 'odgovor.webm');
      const res = await fetch('/api/transkript', { method: 'POST', body: forma });
      const data = await res.json();
      if (data.transkript) setTranskript(data.transkript);
      else setGreska(data.greska ?? 'Transkripcija nije uspjela. Odgovor možete upisati.');
    } catch {
      setGreska('Transkripcija nije uspjela. Odgovor možete upisati ručno.');
    } finally {
      setRadnja('');
    }
  }

  // --- Prikaz --------------------------------------------------------------

  const zauzet = radnja !== '';
  const tekuce = pitanja[indeks];

  if (faza === 'pocetak' || faza === 'priprema') {
    return (
      <section className="zavrsni">
        <div className="zavrsni-pocetak">
          <span className="zavrsni-znak" aria-hidden="true">
            🎓
          </span>
          <h2 className="zavrsni-naslov">Usmena provjera pred asistentom</h2>
          <p className="zavrsni-opis">
            Asistent postavlja <strong>pet pitanja</strong>, svako iz druge nastavne cjeline i
            odabrano nasumično. Pitanje ćete <strong>čuti</strong>, a odgovarate govorom — ili
            tipkanjem, ako više volite. Ako negdje zapnete, asistent će postaviti potpitanje koje
            vas navodi na odgovor.
          </p>
          <p className="zavrsni-napomena">
            Provjera je <strong>informativna</strong> — nema brojčane ocjene ni bodova. 🔒 Snimka se
            ne pohranjuje, čuva se samo transkript.
          </p>
          {greska && <p className="zavrsni-greska">{greska}</p>}
          <button className="gumb-pilula" onClick={pokreni} disabled={faza === 'priprema'}>
            {faza === 'priprema' ? 'Pripremam pitanja…' : 'Započni provjeru'}
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="zavrsni zavrsni-aktivan">
      <div className="zavrsni-traka">
        <span className="zavrsni-napredak">
          {faza === 'ispit' && tekuce
            ? `Pitanje ${tekuce.redni} od ${pitanja.length}`
            : 'Provjera je završena'}
        </span>
        <span className="zavrsni-tocke" aria-hidden="true">
          {pitanja.map((p, i) => (
            <span
              key={p.redni}
              className={`zavrsni-tocka ${
                i < odgovoreno.length ? `ispunjena ${odgovoreno[i]?.ocjena ?? ''}` : ''
              } ${i === indeks && faza === 'ispit' ? 'tekuca' : ''}`}
            />
          ))}
        </span>
      </div>

      <div className="zavrsni-tijek" ref={tijekRef}>
        {replike.map((r, i) => (
          <div key={i} className={`zavrsni-replika zavrsni-${r.autor}`}>
            <span className="zavrsni-autor">
              {r.autor === 'student' ? 'Vi' : r.oznaka ?? 'Asistent'}
            </span>
            <p>{r.tekst}</p>
          </div>
        ))}
        {radnja === 'govorim' && <p className="zavrsni-stanje">🔊 Asistent govori…</p>}
        {radnja === 'transkribiram' && <p className="zavrsni-stanje">✍️ Prepoznajem govor…</p>}
        {radnja === 'procjenjujem' && <p className="zavrsni-stanje">🤔 Razmatram odgovor…</p>}
      </div>

      {greska && <p className="zavrsni-greska">{greska}</p>}

      {faza === 'ispit' && (
        <div className="zavrsni-odgovor">
          {uPotpitanju && <p className="zavrsni-znak-potpitanja">Odgovarate na potpitanje</p>}
          <div className="zavrsni-gumbi">
            {!snima ? (
              <button className="gumb-snimi" onClick={pocniSnimanje} disabled={zauzet}>
                🎤 Snimi odgovor
              </button>
            ) : (
              <button className="gumb-snimi gumb-snima" onClick={zaustaviSnimanje}>
                ⏹ Zaustavi snimanje
              </button>
            )}
          </div>
          <textarea
            className="zavrsni-transkript"
            value={transkript}
            onChange={(e) => setTranskript(e.target.value)}
            rows={4}
            disabled={zauzet || snima}
            placeholder="Odgovorite glasom ili upišite odgovor ovdje…"
          />
          <button
            className="gumb-pilula"
            onClick={posalji}
            disabled={!transkript.trim() || zauzet || snima}
          >
            Pošalji odgovor
          </button>
        </div>
      )}

      {faza === 'gotovo' && (
        <div className="zavrsni-sazetak">
          <h3>Kako je prošlo</h3>
          <ol className="zavrsni-popis">
            {odgovoreno.map((o, i) => (
              <li key={i} className={`zavrsni-stavka ${o.ocjena}`}>
                <span className="zavrsni-oznaka">{OZNAKA_OCJENE[o.ocjena]}</span>
                <span className="zavrsni-opseg">{o.opseg}</span>
                <p className="zavrsni-pitanje-tekst">{o.pitanje}</p>
                {o.izostalo.length > 0 && (
                  <p className="zavrsni-izostalo">Nedostajalo: {o.izostalo.join('; ')}</p>
                )}
              </li>
            ))}
          </ol>
          {zakljucak?.preporuke.length ? (
            <div className="zavrsni-preporuke">
              <h4>Što ponoviti</h4>
              <ul>
                {zakljucak.preporuke.map((p, i) => (
                  <li key={i}>{p}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <button className="gumb-pilula" onClick={() => window.location.reload()}>
            Nova provjera
          </button>
        </div>
      )}
    </section>
  );
}

/** Model ponekad ubaci Markdown iako je zabranjen; naglas se čita čisti tekst. */
function ocistiZaGovor(md: string): string {
  return md
    .replace(/^#+\s*/gm, '')
    .replace(/[*_`>]/g, '')
    .replace(/\n{2,}/g, '. ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 1800);
}

/**
 * Razlaganje na rečenice: sinteza po rečenici omogućuje da druga bude spremna
 * dok prva svira, pa između njih nema tišine.
 */
function naRecenice(tekst: string): string[] {
  const cist = ocistiZaGovor(tekst);
  const dijelovi = cist.match(/[^.!?…]+[.!?…]*["»)\]]?\s*/g);
  return (dijelovi ?? [cist]).map((s) => s.trim()).filter(Boolean);
}
