/**
 * Outils de temps purs : jours locaux, heures du jour, fuseaux IANA.
 *
 * Conventions :
 * - un instant est un nombre de millisecondes depuis l'époque Unix (UTC) ;
 * - un jour local est une chaîne 'YYYY-MM-DD' ;
 * - une heure du jour est une chaîne 'HH:MM' (24 h).
 */

export type Instant = number;
export type LocalDate = string;
export type TimeOfDay = string;

const MINUTE = 60_000;
const DAY = 86_400_000;

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(tz: string): Intl.DateTimeFormat {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    });
    formatters.set(tz, f);
  }
  return f;
}

interface WallClock {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function wallClock(instant: Instant, tz: string): WallClock {
  const parts = formatter(tz).formatToParts(new Date(instant));
  const get = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((p) => p.type === type)?.value ?? '0');
  const hour = get('hour');
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: hour === 24 ? 0 : hour,
    minute: get('minute'),
    second: get('second'),
  };
}

const pad = (n: number): string => String(n).padStart(2, '0');

/** Décalage du fuseau par rapport à UTC, en minutes, à un instant donné. */
export function offsetMinutes(instant: Instant, tz: string): number {
  const base = Math.floor(instant / 1000) * 1000;
  const w = wallClock(base, tz);
  const asUtc = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second);
  return Math.round((asUtc - base) / MINUTE);
}

/** Jour local d'un instant dans un fuseau. */
export function localDateOf(instant: Instant, tz: string): LocalDate {
  const w = wallClock(instant, tz);
  return `${w.year}-${pad(w.month)}-${pad(w.day)}`;
}

/** Heure locale d'un instant, en minutes depuis minuit. */
export function minutesOfDay(instant: Instant, tz: string): number {
  const w = wallClock(instant, tz);
  return w.hour * 60 + w.minute;
}

/** Convertit 'HH:MM' en minutes depuis minuit. */
export function parseTimeOfDay(t: TimeOfDay): number {
  const m = /^(\d{2}):(\d{2})$/.exec(t);
  if (!m) throw new Error(`Heure invalide : ${t}`);
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) throw new Error(`Heure invalide : ${t}`);
  return h * 60 + min;
}

function parseLocalDate(d: LocalDate): [number, number, number] {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d);
  if (!m) throw new Error(`Date invalide : ${d}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

/** Instant correspondant à une date et une heure locales dans un fuseau. */
export function zonedInstant(date: LocalDate, time: TimeOfDay, tz: string): Instant {
  const [y, mo, d] = parseLocalDate(date);
  const minutes = parseTimeOfDay(time);
  const guess = Date.UTC(y, mo - 1, d, Math.floor(minutes / 60), minutes % 60);
  let t = guess - offsetMinutes(guess, tz) * MINUTE;
  t = guess - offsetMinutes(t, tz) * MINUTE;
  return t;
}

export function addDays(date: LocalDate, n: number): LocalDate {
  const [y, mo, d] = parseLocalDate(date);
  const t = new Date(Date.UTC(y, mo - 1, d + n));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

/** Nombre de jours de a vers b (négatif si b est avant a). */
export function daysBetween(a: LocalDate, b: LocalDate): number {
  const [ya, ma, da] = parseLocalDate(a);
  const [yb, mb, db] = parseLocalDate(b);
  return Math.round((Date.UTC(yb, mb - 1, db) - Date.UTC(ya, ma - 1, da)) / DAY);
}

/** Jour de la semaine ISO (1 = lundi … 7 = dimanche). */
export function isoWeekday(date: LocalDate): number {
  const [y, mo, d] = parseLocalDate(date);
  const wd = new Date(Date.UTC(y, mo - 1, d)).getUTCDay();
  return wd === 0 ? 7 : wd;
}

export interface Horaires {
  /** Heure de lever, 'HH:MM'. */
  wake: TimeOfDay;
  /** Heure de coucher, 'HH:MM' ; si elle est avant le lever, le coucher est le lendemain. */
  bed: TimeOfDay;
}

export function crossesMidnight(h: Horaires): boolean {
  return parseTimeOfDay(h.bed) <= parseTimeOfDay(h.wake);
}

/**
 * Journée de plan à laquelle appartient un instant.
 * Si l'utilisateur se couche après minuit, une cigarette fumée entre minuit
 * et l'heure de coucher compte pour la veille.
 */
export function planDayOf(instant: Instant, h: Horaires, tz: string): LocalDate {
  const date = localDateOf(instant, tz);
  if (crossesMidnight(h) && minutesOfDay(instant, tz) < parseTimeOfDay(h.bed)) {
    return addDays(date, -1);
  }
  return date;
}

export interface Fenetre {
  start: Instant;
  end: Instant;
}

/** Fenêtre d'éveil d'une journée de plan (gère le passage à l'heure d'été / d'hiver). */
export function awakeWindow(date: LocalDate, h: Horaires, tz: string): Fenetre {
  const start = zonedInstant(date, h.wake, tz);
  const bedDate = crossesMidnight(h) ? addDays(date, 1) : date;
  const end = zonedInstant(bedDate, h.bed, tz);
  return { start, end };
}

export const minutesBetween = (a: Instant, b: Instant): number => (b - a) / MINUTE;
export const addMinutes = (t: Instant, minutes: number): Instant => t + minutes * MINUTE;
