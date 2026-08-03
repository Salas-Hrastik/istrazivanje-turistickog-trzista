# Knjiga „Istraživanje turističkog tržišta" — što je u kanonskom dokumentu

Analiza isporučenog udžbenika (`materijali/prirucnik.docx`, objedinjeno izdanje).
Strukturu je izvukao `npm run struktura` u [`../data/sadrzaj.json`](../data/sadrzaj.json).
Norme stila prethodne knjige su u [`PREDLOZAK-NOVE-KNJIGE.md`](PREDLOZAK-NOVE-KNJIGE.md);
ovdje je izmjereno **ovo** izdanje.

---

## 1. Što dokument sadrži

| | |
| --- | --- |
| Nastavnih poglavlja | **7** (+ cjelina Dodaci) |
| Odjeljaka | **109** (90 nastavnih, 19 u Dodacima) |
| Pododjeljaka (Heading 3) | 53 |
| Riječi u tijelu teksta | **16 113** |
| Procijenjenih stranica | **72** |
| Tablica | 3 |

Podjela na dijelove (upisana u `lib/prirucnik.ts`, funkcija `dioZaPoglavlje`):

| Dio | Poglavlja | Riječi |
| --- | --- | --- |
| `DIO I · Temelji i priprema istraživanja` | 1, 2 | 2137 · 2104 |
| `DIO II · Prikupljanje i obrada podataka` | 3, 4, 5 | 1948 · 2153 · 1787 |
| `DIO III · Primjena i odgovornost` | 6, 7 | 1639 · 1882 |
| `Dodaci` | 8 (banka pitanja, prilozi, uvodni dio) | 2332 |

Poglavlja su ujednačena — 1639 do 2153 riječi, bez ijednog ispada. Norma prethodne
knjige bila je 1583 riječi (raspon 612–2521), pa je ovo izdanje ujednačenije od nje.

## 2. Kostur poglavlja

Svako poglavlje ima **istih trinaest odjeljaka** (poglavlje 7 ima dvanaest — nema
zasebnog odjeljka o čestim greškama):

```
Uvod
N.0  Ishodi učenja poglavlja        ← 6 ishoda, već napisanih
Ključni pojmovi                     ← 10–15 pojmova u obliku „pojam — definicija"
N.1 … N.4  Razrada gradiva          ← 3–4 tematska odjeljka, s pododjeljcima
N.5  Studija slučaja (Hrvatska)
N.6  Praktični zadatak
N.7  Interaktivna provjera znanja   ← pitanja s rješenjima
N.8  Sažetak
N.9  Preporučeno daljnje čitanje
N.10 Literatura (Poglavlje N)
```

Dosljednost je potpuna: 7 od 7 poglavlja ima sve elemente. Prethodna knjiga to nije
imala (`PRIMJER IZ PRAKSE` u 6 od 10, `AI U FOKUSU` u 8 od 10 poglavlja).

## 3. Tri nastavna elementa već postoje u tekstu

Ovo mijenja radni tijek. U prethodnoj knjizi ciljevi, kartice i kviz nastajali su
kao **nacrti** koje model izvodi iz teksta (`npm run nacrti`), pa ih je nastavnik
odobravao. Ovdje su sva tri autorova, napisana u udžbeniku:

| Element aplikacije | Izvor u dokumentu | Količina |
| --- | --- | --- |
| Ciljevi učenja | `N.0 Ishodi učenja poglavlja` | 6 po poglavlju, 42 ukupno |
| Kartice za učenje | `Ključni pojmovi` | 10–15 po poglavlju |
| Kviz | `N.7 Interaktivna provjera znanja` + `Banka pitanja` | 4–13 po poglavlju |

Treba ih **uvesti**, ne generirati. To znači jednu novu skriptu koja ih čita iz
DOCX-a i upisuje odmah odobrene, jer ih je pisao autor. `npm run nacrti` ostaje kao
rezerva za ono što bi nedostajalo.

**Ključni pojmovi** su već u obliku kartice, doslovno:
> *Sezonalnost — vremenska koncentracija turističke potražnje u određenim dijelovima
> godine, karakteristična za većinu mediteranskih destinacija.*

## 4. Tri stvari koje treba riješiti

### 4.1 Paginacija — jedino što blokira točne citate

Dokument **nikad nije bio otvoren u Wordu**: nema nijedan `w:lastRenderedPageBreak`,
samo 11 tvrdih prijeloma (po jedan pred svako poglavlje). Bez toga bi cijelo
poglavlje 1 dijelilo citat „str. 4".

Privremeno rješenje je u kodu: kad Wordove paginacije nema, `lib/docx.ts` je
**procjenjuje** iz duljine teksta (2000 znakova po stranici) i to označava u
`data/sadrzaj.json` poljem `"paginacija": "procijenjena"`. `npm run struktura`
pritom ispisuje upozorenje.

Procjena je zamjena, ne istina. **Otvorite li udžbenik u Wordu i samo ga spremite**,
Word upiše stvarnu paginaciju — tada ponoviti `npm run struktura` i `npm run ingest`
i citati postaju točni. Isto vrijedi ako udžbenik ide u prijelom: mjerodavne su
stranice konačnog izdanja.

### 4.2 Točan odgovor je gotovo uvijek „b"

Izmjereno na pitanjima s ispisanim rješenjem: **27 od 37** ima točan odgovor pod
„b". Sučelje miješa redoslijed *pitanja*, ali ne i *odgovora unutar pitanja*, pa
student koji to primijeti pogađa slovo umjesto gradiva.

Rješenje je u uvozniku: pri unosu **promiješati ponuđene odgovore** i preračunati
`tocan_index`. Time se ne dira autorov tekst.

### 4.3 Pitanja koja aplikacija ne zna prikazati

Kviz podržava isključivo pitanje s **točno četiri** ponuđena odgovora i jednim
točnim. U dokumentu se pojavljuju i:

- pitanja s **tri** ponuđena odgovora (npr. 2.7, 3.7) — shema traži četiri;
- **spajanje parova** (2.7) i **razvrstavanje izvora** (3.7) — nema komponente;
- **Točno / Netočno** i **kratki odgovor** (banka pitanja) — nema komponente.

Prijedlog: uvesti ono što je već višestruki izbor s četiri odgovora, a ostalo
ostaviti u tekstu poglavlja (student ga i dalje čita u „Prouči"). Ako želite i te
vrste kao interaktivne, to je proširenje sheme i `QuizRunner`-a — oko pola dana po
vrsti.

## 5. Što je već napravljeno

- `materijali/prirucnik.docx` na mjestu (nije u gitu, kako i treba).
- `lib/prirucnik.ts` prepoznaje naslove oblika `Poglavlje N: Naslov` (dosad samo
  `01 · Naslov`), zna nove dijelove knjige i preskače kazalo — kazalo bi u dohvatu
  pogađalo gotovo svaki upit, a ne nosi gradivo.
- `lib/docx.ts` procjenjuje paginaciju kad je Wordova nema (§4.1).
- `data/sadrzaj.json` upisan: 8 cjelina, 109 odjeljaka.

## 6. Što slijedi

1. Novi Supabase projekt → `supabase/schema.sql` → `.env.local`.
2. `npm run ingest` — tekst i ugradnje.
3. Nova skripta za uvoz ishoda, ključnih pojmova i pitanja iz DOCX-a (§3), s
   miješanjem odgovora (§4.2).
4. `npm run rag:debug` — izmjeriti pragove pokrića i uskladiti `ragMinScore`.
5. Multimedija: po jedan video, audio i prezentacija na cjelinu (7 × 3).
6. Korice i paleta boja.
7. `npm run knjiga:mjere` — usporedba s predloškom.
