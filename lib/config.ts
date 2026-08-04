/** Središnja konfiguracija aplikacije. ENV varijable nadjačavaju zadane vrijednosti. */

function int(name: string, fallback: number): number {
  const v = process.env[name];
  const n = v ? parseInt(v, 10) : NaN;
  return Number.isFinite(n) ? n : fallback;
}
function num(name: string, fallback: number): number {
  const v = process.env[name];
  const n = v ? parseFloat(v) : NaN;
  return Number.isFinite(n) ? n : fallback;
}
function bool(name: string, fallback: boolean): boolean {
  const v = process.env[name];
  if (v === undefined || v === '') return fallback;
  return v === '1' || v.toLowerCase() === 'true';
}

export const config = {
  siteName: process.env.NEXT_PUBLIC_SITE_NAME || 'Istraživanje turističkog tržišta — AI asistent kolegija',
  assistantName: process.env.NEXT_PUBLIC_ASSISTANT_NAME || 'Vita',
  ustanova: process.env.NEXT_PUBLIC_USTANOVA || 'Veleučilište Baltazar Zaprešić',
  /**
   * Autor priručnika. Prazna vrijednost znači da se potpis nigdje ne prikazuje.
   */
  autorPrirucnika: process.env.NEXT_PUBLIC_AUTOR_PRIRUCNIKA || 'prof. dr. sc. Drago Ružić',
  kolegij: 'Istraživanje turističkog tržišta',
  studij: 'Management u turizmu i ugostiteljstvu',

  /**
   * Autentikacija je u cijelosti implementirana, ali NAMJERNO UMIROVLJENA do
   * završetka izrade asistenta. Dok je isključena, napredak se veže uz
   * anonimni identifikator gosta iz kolačića (vidi lib/auth.ts).
   */
  authEnabled: bool('AUTH_ENABLED', false),

  claudeModel: process.env.CLAUDE_MODEL || 'claude-sonnet-5',
  claudeMaxTokens: int('CLAUDE_MAX_TOKENS', 3000),

  /**
   * Usmeni razgovor: odgovor se SLUŠA, pa mora biti kratak, a odgovor se struji
   * pa se prva rečenica izgovara prije nego što je cjelina gotova.
   *
   * Model je Sonnet, ne Haiku: Haiku je bio ~1 s brži do prve rečenice, ali je
   * u hrvatskom griješio ("neizvješan", "nešto pošli po zlu", "Krećemo s
   * Poglavlja 1") i ignorirao zabranu Markdowna. Za alat koji studentima čita
   * naglas ta je razlika skuplja od sekunde.
   */
  usmeniModel: process.env.USMENI_MODEL || 'claude-sonnet-5',
  usmeniMaxTokens: int('USMENI_MAX_TOKENS', 400),
  usmeniTopK: int('USMENI_TOP_K', 6),

  embeddingProvider: (process.env.EMBEDDING_PROVIDER || 'openai') as 'openai' | 'voyage',
  embeddingModel: process.env.EMBEDDING_MODEL || 'text-embedding-3-small',
  embeddingDim: int('EMBEDDING_DIM', 1536),

  asrModel: process.env.ASR_MODEL || 'whisper-1',
  ttsModel: process.env.TTS_MODEL || 'gpt-4o-mini-tts',
  ttsVoice: process.env.TTS_VOICE || 'alloy',

  /**
   * Govor-na-govor (Realtime). Razgovor ide izravno između preglednika i
   * OpenAI-ja, pa otpada ciklus snimka → prijepis → odgovor → sinteza.
   */
  realtimeModel: process.env.REALTIME_MODEL || 'gpt-realtime-2.1',
  realtimeVoice: process.env.REALTIME_VOICE || 'marin',
  realtimeUkljucen: bool('REALTIME', true),

  ragTopK: int('RAG_TOP_K', 10),
  ragRerankTopN: int('RAG_RERANK_TOP_N', 6),
  ragRerank: bool('RAG_RERANK', true),
  rerankModel: process.env.RERANK_MODEL || 'claude-haiku-4-5-20251001',
  ragContextCharBudget: int('RAG_CONTEXT_CHAR_BUDGET', 11000),
  /**
   * Brane pokrića. Apsolutne su i mjere se PO KNJIZI, jer ovise o gradivu, a ne
   * o kodu — izvedene iz `ragMinScore` množenjem bile bi promašaj čim se osnovna
   * vrijednost pomakne.
   *
   * Izmjereno na ovom udžbeniku (12 pitanja iz gradiva, 8 izvan njega):
   *   u gradivu 0,47–0,77 · izvan gradiva 0,26–0,44
   * Razmak je uzak jer je i ono „izvan" turističko („najbolje plaže na Hvaru"
   * postiže 0,44), pa brana stoji tik iznad njega.
   */
  ragMinScore: num('RAG_MIN_SCORE', 0.45),
  /**
   * Govorna brana je stroža: izgovorenu tvrdnju nitko ne provjerava, a pitanje
   * na rubu pokrića bolje je odbiti nego odgovoriti napola.
   */
  ragGovorMinScore: num('RAG_GOVOR_MIN_SCORE', 0.52),
  /** Granice pouzdanosti odgovora koje se prikazuju uz citate. */
  ragSigurnostVisoka: num('RAG_SIGURNOST_VISOKA', 0.65),
  ragSigurnostSrednja: num('RAG_SIGURNOST_SREDNJA', 0.52),

  maxChunkTokens: int('MAX_CHUNK_TOKENS', 320),
  chunkOverlapTokens: int('CHUNK_OVERLAP_TOKENS', 60),

  prirucnikDocxPath: process.env.PRIRUCNIK_DOCX_PATH || './materijali/prirucnik.docx',

  /**
   * Supabase Storage: naziv bucketa i obrazac mape po cjelini. Podesivi su jer
   * se imenovanje razlikuje od projekta do projekta, a skripte za medije i
   * slajdove inače traže mapu koje nema i tiho ne nađu ništa.
   * U obrascu `{n}` je broj cjeline.
   */
  storageBucket: process.env.STORAGE_BUCKET || 'mediji',
  storageMapa: process.env.STORAGE_MAPA || '{n} cjelina',
  dopunskiDir: process.env.DOPUNSKI_DIR || './materijali/dopunski',
};

/**
 * API ključ ide u HTTP zaglavlje, koje podnosi samo znakove do 255. Ako se u
 * varijablu zalijepi MASKIRANI prikaz ključa (niz „••••"), fetch pukne uz
 * nerazumljivo „Cannot convert argument to a ByteString". Zato se vrijednost
 * provjerava ovdje i greška se imenuje jasno.
 */
function provjeriKljuc(name: string, vrijednost: string): string {
  const cist = vrijednost.trim();
  const problem = [...cist].find((z) => z.charCodeAt(0) > 255);
  if (problem) {
    const maskiran = cist.includes('•') || cist.includes('●') || cist.includes('*');
    throw new Error(
      `Vrijednost varijable ${name} sadrži nedopušten znak „${problem}". ` +
        (maskiran
          ? 'Izgleda da je spremljen MASKIRANI prikaz ključa (točkice) umjesto stvarne vrijednosti — upišite pravi ključ.'
          : 'Ključ smije sadržavati samo obične ASCII znakove.'),
    );
  }
  return cist;
}

export function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v || !v.trim()) throw new Error(`Nedostaje obavezna ENV varijabla: ${name}`);
  return provjeriKljuc(name, v);
}

/** Ključ za OpenAI govorne usluge (ASR/TTS); pada natrag na OPENAI_API_KEY. */
export function speechApiKey(): string {
  const ime = process.env.SPEECH_API_KEY?.trim() ? 'SPEECH_API_KEY' : 'OPENAI_API_KEY';
  const v = process.env.SPEECH_API_KEY || process.env.OPENAI_API_KEY;
  if (!v || !v.trim()) throw new Error('Nedostaje SPEECH_API_KEY (ili OPENAI_API_KEY) za ASR/TTS.');
  return provjeriKljuc(ime, v);
}

/** Mapa cjeline u Storageu prema obrascu iz config.storageMapa („3 cjelina", „cjelina-3"…). */
export function mapaCjeline(broj: number): string {
  return config.storageMapa.replace('{n}', String(broj));
}
