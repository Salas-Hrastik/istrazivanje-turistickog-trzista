# Plan knjige „Istraživanje turističkog tržišta"

Strojno čitljiva verzija: [`../data/plan-knjige.json`](../data/plan-knjige.json).
Norme stila prenesene su iz prethodne knjige i opisane u
[`PREDLOZAK-NOVE-KNJIGE.md`](PREDLOZAK-NOVE-KNJIGE.md); ovdje je **ovaj** naslov
uspoređen s njima.

---

## 1. Struktura

**8 poglavlja** (7 nastavnih + Dodaci), **26 nastavnih odjeljaka**, tri dijela:

| Dio | Poglavlja |
| --- | --- |
| `DIO I · Temelji i priprema istraživanja` | 1. Uvod u istraživanje turističkog tržišta · 2. Proces i planiranje istraživanja tržišta |
| `DIO II · Prikupljanje i obrada podataka` | 3. Izvori, vrste i prikupljanje podataka · 4. Određivanje uzorka i oblikovanje instrumenata · 5. Obrada i analiza prikupljenih podataka |
| `DIO III · Primjena i odgovornost` | 6. Izvještavanje, prezentacija i primjena rezultata · 7. Etika u istraživanju turističkog tržišta |
| `Dodaci` | 8. Predgovor · Pojmovnik · Literatura |

Podjela na tri dijela **nije bila u isporučenom nacrtu** — dodana je jer sučelje
grupira cjeline po dijelovima na naslovnici, a sedam poglavlja u jednom nizu
izgleda kao neraščlanjen popis. Granice slijede prirodan tijek istraživanja
(priprema → izvedba → primjena). Ako se ne slaže s vašom podjelom, mijenja se u
`data/plan-knjige.json`, polje `dio`.

Poglavlje 8 (Dodaci) nije bilo u nacrtu, a prethodna knjiga ga ima: naslovi bez
broja poglavlja (Predgovor, Pojmovnik, Literatura) automatski završe ondje, pa je
bolje da cjelina postoji nego da se pojavi kao ostatak.

---

## 2. Odstupanja od izmjerenih normi

| Norma (prethodna knjiga) | Ovaj plan | Ocjena |
| --- | --- | --- |
| 8–12 nastavnih poglavlja | **7** | u redu, na donjoj granici |
| 6 odjeljaka po poglavlju (4–7) | **3–4**, prosjek 3,7 | **ispod norme** |
| 6 stranica po poglavlju | tek se piše | cilj: 6–8 |
| ~1580 riječi po poglavlju | tek se piše | cilj: 1400–1800 |

**Odjeljci su jedino stvarno odstupanje.** Odjeljak je granularnost dohvata: svaki
citat nosi naslov odjeljka i raspon stranica. S tri odjeljka po poglavlju isječci
postaju širi, pa citat „str. 12–18" studentu kaže manje nego „4.2 Oblikovanje
instrumenata, str. 14–15".

Gdje se prirodno dobiva peti i šesti odjeljak, bez izmišljanja gradiva:

- **1.** dodati odjeljak o dionicima istraživanja (tko naručuje i tko koristi
  nalaze) i o odnosu istraživanja tržišta prema statistici turizma.
- **4.** razdvojiti 4.2 na *strukturu upitnika i vrste pitanja* i *vodiče za
  intervju i obrasce za promatranje* — sada su dvije različite metode u jednom
  odjeljku; time poglavlje dobiva četvrti, a s veličinom uzorka iz 4.1 i peti.
- **7.** dodati odjeljak o etičkim odborima i pristanku ustanove te o autorstvu i
  citiranju u istraživačkim izvještajima.

Poglavlja 2, 3, 5 i 6 imaju po četiri odjeljka i mogu ostati takva.

---

## 3. Kostur poglavlja

Iz nacrta se u svakom poglavlju ponavljaju **tri** okvira, i to je dobro — u
prethodnoj knjizi okviri su bili nedosljedni (`PRIMJER IZ PRAKSE` u 6 od 10
poglavlja, `AI U FOKUSU` u 8 od 10). Ovdje su svi u svih sedam:

```
## N.1 Naslov odjeljka
   2–4 odlomka tekuće proze
…
STUDIJA SLUČAJA · hrvatski primjer, 1–2 odlomka
PRAKTIČNI ZADATAK · što student radi, 1 odlomak
SAŽETAK POGLAVLJA · 3–5 rečenica
PITANJA ZA PONAVLJANJE · 4–6 pitanja otvorenog tipa
```

**Dva okvira treba dodati:** `SAŽETAK POGLAVLJA` i `PITANJA ZA PONAVLJANJE` bili
su u **10 od 10** poglavlja prethodne knjige i u nacrtu ih nema. Bez njih poglavlje
nema zatvaranje, a „Prouči" u sučelju ostaje bez završnog koraka.

„Interaktivna provjera znanja" iz nacrta **nije okvir u tekstu** — to je kviz
cjeline, koji živi u aplikaciji, ne u knjizi. Zato ne ulazi u DOCX (vidi §4).

Ostale konvencije pisanja (tekuća proza, odlomak 40–60 riječi, pojam uveden u
rečenici, autor + ustanova + godina pri navođenju tuđeg modela) prenose se
nepromijenjene — [§4 predloška](PREDLOZAK-NOVE-KNJIGE.md#4-kostur-poglavlja--vidljivi-potpis-stila).

---

## 4. Interaktivne provjere — što aplikacija danas podržava

Nacrt traži šest različitih vrsta provjere. Kviz u aplikaciji zna **samo jednu**:
pitanje s točno četiri ponuđena odgovora i jednim točnim.

| Poglavlje | Tražena vrsta | Stanje |
| --- | --- | --- |
| 1 | višestruki izbor (MIS) | ✅ radi danas |
| 5 | višestruki izbor (odabir statističke mjere) | ✅ radi danas |
| 2 | spajanje parova (ciljevi ↔ hipoteze) | ❌ nema komponente |
| 3 | razvrstavanje (primarni/sekundarni, interni/eksterni) | ❌ nema komponente |
| 4 | prepoznavanje pogrešaka u anketnim pitanjima | ⚠️ izvedivo kao višestruki izbor |
| 6 | donošenje odluke na temelju nalaza | ⚠️ izvedivo kao višestruki izbor |
| 7 | scenariji („etički ili neetički?") | ⚠️ izvedivo kao višestruki izbor |

Četiri od sedam mogu se **danas** izvesti kao višestruki izbor bez gubitka
smisla: scenarij ili loše formulirano pitanje ide u tekst pitanja, a ponuđeni
odgovori su prosudbe. Dvije vrste — **spajanje parova** i **razvrstavanje** —
tražile bi nove komponente i proširenje tablice `kviz_pitanja` novim tipom.

Odluka prije pisanja poglavlja 2 i 3: svesti ih na višestruki izbor, ili uložiti
u dvije nove vrste zadatka. Druga opcija znači izmjenu sheme baze, uvoznika kviza
i `QuizRunner`-a — procjena je pola dana rada po vrsti.

---

## 5. Što je već podešeno u instanci

- naziv kolegija, naslov i opis (`lib/config.ts`, `app/layout.tsx`, naslovnica);
- primjeri terminologije u promptovima zamijenjeni pojmovima ovog kolegija
  („sekundarni podaci", „probabilistički uzorak", „Likertova skala") — inače bi
  asistent studentima nudio pojmove iz prethodne knjige;
- stranice „O priručniku" i „Izvori" opisuju ovu knjigu;
- korice su privremeno složene iz CSS-a dok prava naslovnica ne bude gotova;
- podaci prethodne knjige (`data/sadrzaj.json`, slajdovi, dopunski izvori, mjere)
  **nisu** preneseni.

## 6. Što još nije odlučeno

- **Autor.** Zadano stoji `prof. dr. sc. Drago Ružić` i s njim životopis iz
  prethodne knjige (`components/ZivotopisModal.tsx`). Ako je autor drugi, treba
  promijeniti oboje.
- **Boje.** Paleta je „more i obala", izvedena iz teme prethodnog kolegija. Za
  metodologiju istraživanja bolje bi pristajala mirnija, podatkovna paleta —
  mijenja se u `:root` u `app/globals.css`, sve ostalo se referira na te varijable.
- **Supabase projekt.** Nova instanca traži vlastiti projekt, izvršenu
  `supabase/schema.sql` i vlastiti `.env.local`.
- **Multimedija.** Predložak traži po jedan video, audio i prezentaciju na cjelinu
  (7 × 3 = 21 datoteka).

---

## 7. Redoslijed rada

1. Potvrditi podjelu na dijelove i dopuniti odjeljke prema §2.
2. Napisati DOCX prema §3 — Wordovi stilovi naslova su obavezni
   ([§3 predloška](PREDLOZAK-NOVE-KNJIGE.md#3-konvencije-izvornog-docx-a)).
3. Novi Supabase projekt → `supabase/schema.sql` → `.env.local`.
4. `npm run struktura -- --provjeri`, pa `npm run struktura`.
5. `npm run ingest`.
6. `npm run nacrti -- --ciljevi --kartice --kviz`, pa pregled i odobravanje.
7. Multimedija u Storage, pa `npm run mediji` i `npm run slajdovi`.
8. `npm run rag:debug` → izmjeriti pragove pokrića i uskladiti `ragMinScore`.
9. Korice i paleta.
10. `npm run knjiga:mjere` → usporediti s predloškom.
