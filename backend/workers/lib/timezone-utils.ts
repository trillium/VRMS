const LA_TZ = 'America/Los_Angeles';

interface LAComponents {
  year: number;
  month: number;   // 1-12
  day: number;     // 1-31
  hour: number;    // 0-23
  minute: number;
  second: number;
  dayOfWeek: number; // 0=Sun, 1=Mon, ... 6=Sat
}

/**
 * Extract Los Angeles wall-clock components from any UTC Date.
 * Uses Intl.DateTimeFormat — no external dependencies.
 */
function getLAComponents(date: Date): LAComponents {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: LA_TZ,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hour12: false,
    weekday: 'short',
  });

  const parts = fmt.formatToParts(date);
  const get = (type: string): string =>
    parts.find((p) => p.type === type)?.value ?? '0';

  const weekdayStr = get('weekday');
  const weekdayMap: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };

  // Intl hour12:false gives "24" for midnight in some engines — normalize
  let hour = parseInt(get('hour'), 10);
  if (hour === 24) hour = 0;

  return {
    year: parseInt(get('year'), 10),
    month: parseInt(get('month'), 10),
    day: parseInt(get('day'), 10),
    hour,
    minute: parseInt(get('minute'), 10),
    second: parseInt(get('second'), 10),
    dayOfWeek: weekdayMap[weekdayStr] ?? 0,
  };
}

/**
 * Get the day-of-week (0=Sun..6=Sat) in Los Angeles timezone.
 */
function getLADayOfWeek(date: Date): number {
  return getLAComponents(date).dayOfWeek;
}

/**
 * Convert LA wall-clock values to a correct UTC Date.
 *
 * Two-pass approach to handle DST safely:
 * 1. Make a rough UTC guess by assuming a nominal offset.
 * 2. Format that guess back to LA components to learn the real offset.
 * 3. Apply the real offset.
 */
function laWallClockToUTC(
  year: number,
  month: number,  // 1-12
  day: number,
  hour: number,
  minute: number,
  second: number = 0,
): Date {
  // Pass 1: rough guess using UTC-8 (PST)
  const roughUTC = new Date(Date.UTC(year, month - 1, day, hour + 8, minute, second));

  // Get the actual LA components for this rough guess
  const actual = getLAComponents(roughUTC);

  // Compute the difference between what we wanted and what we got
  // This tells us the real offset
  const wantedMs = Date.UTC(year, month - 1, day, hour, minute, second);
  const gotMs = Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour, actual.minute, actual.second);
  const diffMs = wantedMs - gotMs;

  // Pass 2: adjust the rough guess by the difference
  return new Date(roughUTC.getTime() + diffMs);
}

/**
 * Check if two UTC Dates fall on the same calendar day in Los Angeles.
 */
function isSameLADate(date1: Date, date2: Date): boolean {
  const c1 = getLAComponents(date1);
  const c2 = getLAComponents(date2);
  return c1.year === c2.year && c1.month === c2.month && c1.day === c2.day;
}

export { getLAComponents, getLADayOfWeek, laWallClockToUTC, isSameLADate };
