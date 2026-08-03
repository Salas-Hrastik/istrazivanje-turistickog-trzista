import Link from 'next/link';
import { config } from '@/lib/config';

export const metadata = { title: 'O priručniku' };

/**
 * Opis knjige prema planu iz `data/plan-knjige.json`. Dok priručnik nije
 * napisan, ovdje NE stoje tvrdnje o sadržaju kojega još nema — samo struktura
 * koja je dogovorena.
 */
export default function OPrirucnikuPage() {
  return (
    <div className="page page-autori">
      <p className="mrvice-redak">
        <Link href="/">← Naslovnica</Link>
      </p>
      <h1>O priručniku</h1>

      <article className="autor-kartica">
        <h2>Istraživanje turističkog tržišta</h2>
        <p className="autor-podnaslov">
          Od definiranja problema do odluke — metodologija istraživanja u turizmu.
        </p>
        <p>
          Veleučilišni priručnik i nastavni materijal za studente {config.ustanova}a, studij{' '}
          {config.studij}. Podloga je za učenje na kolegiju <em>{config.kolegij}</em>.
        </p>
        <p>
          Gradivo je podijeljeno u tri dijela. <strong>Dio I</strong> postavlja temelje i pripremu
          istraživanja: što je istraživanje turističkog tržišta, po čemu je to tržište osobito, kako
          teče proces istraživanja i kako se definira problem. <strong>Dio II</strong> vodi kroz
          prikupljanje i obradu podataka — izvore, uzorke, instrumente te statističku i kvalitativnu
          analizu. <strong>Dio III</strong> zatvara krug primjenom i odgovornošću: izvještavanjem,
          prezentacijom rezultata i etikom istraživanja.
        </p>
        <p>
          Kroz tekst se u svakom poglavlju ponavljaju didaktički elementi: <em>Studija slučaja</em>{' '}
          na hrvatskim primjerima, <em>Praktični zadatak</em>, <em>Interaktivna provjera znanja</em>{' '}
          te <em>Sažetak poglavlja</em> i <em>Pitanja za ponavljanje</em>.
        </p>
      </article>

      <article className="autor-kartica">
        <h2>Kako ovaj asistent koristi priručnik</h2>
        <p>
          Asistent „{config.assistantName}&ldquo; odgovara <strong>isključivo</strong> na temelju
          sadržaja priručnika. Svaki odgovor navodi poglavlje i raspon stranica na kojima se tvrdnja
          nalazi. Ako u priručniku nema podloge za odgovor, asistent to otvoreno kaže i predloži gdje
          tražiti — umjesto da nagađa.
        </p>
        <p>
          Dopunski izvori, ako ih priručnik navodi, dostupni su odvojeno i u citatima su uvijek
          označeni kao dopunski. Popis vidi na stranici <Link href="/izvori">Izvori</Link>.
        </p>
      </article>
    </div>
  );
}
