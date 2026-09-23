/* The weather at the resort.
 *
 * Read from Open-Meteo, which needs no key and answers cross-origin, so every
 * phone asks for itself and the book carries no secret. What comes back is
 * somebody else's JSON arriving over somebody else's network, so nothing here
 * trusts it: `read` returns a forecast only if every field it means to show is
 * actually a number, and null otherwise. A strip that says it cannot reach the
 * forecast is a great deal better than one confidently showing NaN°.
 */

export const LAT = 36.86854, LNG = 30.97629, TZ = 'Europe/Istanbul';

export function url(days = 2) {
  const q = new URLSearchParams({
    latitude: String(LAT), longitude: String(LNG),
    current: 'temperature_2m,apparent_temperature,is_day,weather_code',
    hourly: 'temperature_2m,weather_code',
    daily: 'temperature_2m_max,temperature_2m_min',
    timezone: TZ, forecast_days: String(days),
  });
  return 'https://api.open-meteo.com/v1/forecast?' + q.toString();
}

/* The WMO codes Open-Meteo reports, grouped to the handful of pictures a
   person actually needs. `g` names the glyph; `n` is the night form where
   there is one. */
const CODES = [
  [[0], 'Clear', 'sun', 'moon'],
  [[1], 'Mostly clear', 'sun', 'moon'],
  [[2], 'Partly cloudy', 'suncloud', 'mooncloud'],
  [[3], 'Overcast', 'cloud', 'cloud'],
  [[45, 48], 'Fog', 'fog', 'fog'],
  [[51, 53, 55, 56, 57], 'Drizzle', 'drizzle', 'drizzle'],
  [[61, 63, 65, 66, 67], 'Rain', 'rain', 'rain'],
  [[80, 81, 82], 'Showers', 'showers', 'showers'],
  [[71, 73, 75, 77, 85, 86], 'Snow', 'snow', 'snow'],
  [[95, 96, 99], 'Thunderstorm', 'storm', 'storm'],
];

/** What a code means: `{ word, glyph }`. Anything unrecognised is honest about it. */
export function look(code, isDay = true) {
  for (const [list, word, day, night] of CODES) {
    if (list.includes(code)) return { word, glyph: isDay ? day : night };
  }
  return { word: '—', glyph: 'cloud' };
}

export const toF = c => c * 9 / 5 + 32;

/** A temperature, rounded, in whichever scale this phone is set to. */
export function degrees(c, unit) {
  if (typeof c !== 'number' || !isFinite(c)) return '—';
  return String(Math.round(unit === 'F' ? toF(c) : c)) + '°';
}

const num = v => (typeof v === 'number' && isFinite(v) ? v : null);

/** Read a forecast out of whatever came back, or null if it is not one.
 *  `now` is the moment to start the hourly run from, in milliseconds. */
export function read(json, now = Date.now()) {
  if (!json || typeof json !== 'object' || json.error) return null;
  const c = json.current;
  if (!c || typeof c !== 'object') return null;
  const temp = num(c.temperature_2m);
  if (temp == null) return null;                    // the one field it exists to show

  const h = json.hourly && typeof json.hourly === 'object' ? json.hourly : null;
  const hours = [];
  if (h && Array.isArray(h.time) && Array.isArray(h.temperature_2m)) {
    const codes = Array.isArray(h.weather_code) ? h.weather_code : [];
    for (let i = 0; i < h.time.length && hours.length < 12; i++) {
      const t = Date.parse(h.time[i] + (/[Zz+]/.test(String(h.time[i])) ? '' : 'Z'));
      const v = num(h.temperature_2m[i]);
      if (!isFinite(t) || v == null) continue;
      if (t < now - 3600e3) continue;               // hours already gone
      hours.push({ at: t, c: v, code: num(codes[i]) });
    }
  }

  const d = json.daily && typeof json.daily === 'object' ? json.daily : null;
  const pick = (k) => (d && Array.isArray(d[k]) ? num(d[k][0]) : null);

  return {
    c: temp,
    feels: num(c.apparent_temperature),
    code: num(c.weather_code),
    isDay: c.is_day == null ? true : !!c.is_day,
    hours,
    max: pick('temperature_2m_max'),
    min: pick('temperature_2m_min'),
    /* The resort's own clock, so "9pm" on the strip is 9pm on the terrace.
       Open-Meteo returns local times when asked for a timezone, and the
       offset it used comes back with them. */
    offset: num(json.utc_offset_seconds) || 0,
  };
}

/** The hour label for the strip, on the resort's clock. */
export function hourLabel(ms, offsetSeconds, nowMs) {
  if (nowMs != null && ms - nowMs < 1800e3) return 'Now';
  const h = new Date(ms + offsetSeconds * 1000).getUTCHours();
  const ap = h < 12 ? 'am' : 'pm';
  return (h % 12 === 0 ? 12 : h % 12) + ap;
}
