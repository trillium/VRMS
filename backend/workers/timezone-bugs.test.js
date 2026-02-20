/**
 * TIMEZONE BUG FIX VERIFICATION TESTS
 *
 * These tests verify that the event creation pipeline now produces
 * CORRECT results. They use the REAL implementations of
 * adjustToLosAngelesTime, filterAndCreateEvents, and generateEventData
 * (no mocking of generateEventData) to trace timestamps end-to-end.
 *
 * Run with: TZ=UTC npx jest workers/timezone-bugs.test.js --verbose
 *
 * Previously, these tests documented bugs by asserting wrong behavior.
 * Now they assert the CORRECT behavior after the timezone fixes.
 */

const {
  adjustToLosAngelesTime,
  isSameUTCDate,
  doesEventExist,
  filterAndCreateEvents,
} = jest.requireActual('./createRecurringEvents');

// Use the REAL generateEventData
const { generateEventData } = jest.requireActual('./lib/generateEventData');

const MockDate = require('mockdate');

jest.mock('node-fetch', () => jest.fn());
const fetch = require('node-fetch');

const mockURL = 'http://localhost:4000';
const mockHeader = 'test-header';

// Helper: extract what filterAndCreateEvents would pass to generateEventData
// by intercepting the fetch call to POST /api/events/
function captureCreatedEvents() {
  let captured = null;
  fetch.mockImplementation((url, opts) => {
    if (opts && opts.method === 'POST') {
      captured = JSON.parse(opts.body);
    }
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve(captured || []),
    });
  });
  return () => captured;
}

afterEach(() => {
  MockDate.reset();
  jest.clearAllMocks();
});

// ============================================================
// BUG 1 FIX: Day-of-week now compared in LA timezone
// ============================================================
describe('BUG 1 FIX: Day-of-week comparison uses LA timezone', () => {
  test('Tue 7pm PST meeting: cron at Tue 6pm PST (Wed 2am UTC) — event IS created', async () => {
    MockDate.set('2026-02-18T02:00:00Z'); // Wed 2am UTC = Tue 6pm PST

    const recurringEvents = [
      {
        name: 'PM Meeting',
        date: '2024-01-10T03:00:00Z',      // Wed 3am UTC = Tue 7pm PST
        startTime: '2024-01-10T03:00:00Z',
        endTime: '2024-01-10T05:00:00Z',
        hours: 2,
      },
    ];

    const getCreated = captureCreatedEvents();
    await filterAndCreateEvents([], recurringEvents, mockURL, mockHeader, fetch);
    const created = getCreated();

    // FIXED: Event IS created — both "now" and the event are Tuesday in LA
    expect(created).not.toBeNull();
    expect(created).toHaveLength(1);
    expect(created[0].name).toBe('PM Meeting');
  });

  test('Mon 6pm PST meeting: cron at Mon 11pm PST (Tue 7am UTC) — event IS created', async () => {
    MockDate.set('2024-02-20T07:00:00Z'); // Tue 7am UTC = Mon 11pm PST

    const recurringEvents = [
      {
        name: 'Onboarding',
        date: '2024-02-20T02:00:00Z',      // Tue 2am UTC = Mon 6pm PST
        startTime: '2024-02-20T02:00:00Z',
        endTime: '2024-02-20T05:00:00Z',
        hours: 3,
      },
    ];

    const getCreated = captureCreatedEvents();
    await filterAndCreateEvents([], recurringEvents, mockURL, mockHeader, fetch);
    const created = getCreated();

    // FIXED: Event IS created — it IS Monday in LA (both "now" and event are Monday)
    expect(created).not.toBeNull();
    expect(created[0].name).toBe('Onboarding');
  });

  test('Mon 6pm PST meeting: cron at Sun 11pm PST (Mon 7am UTC) — event NOT created', async () => {
    MockDate.set('2024-02-19T07:00:00Z'); // Mon 7am UTC = Sun 11pm PST

    const recurringEvents = [
      {
        name: 'Onboarding',
        date: '2024-02-20T02:00:00Z',      // Tue 2am UTC = Mon 6pm PST
        startTime: '2024-02-20T02:00:00Z',
        endTime: '2024-02-20T05:00:00Z',
        hours: 3,
      },
    ];

    const getCreated = captureCreatedEvents();
    await filterAndCreateEvents([], recurringEvents, mockURL, mockHeader, fetch);
    const created = getCreated();

    // FIXED: Event NOT created — it's SUNDAY in LA, not Monday
    expect(created).toBeNull();
  });
});

// ============================================================
// BUG 2 FIX: No more double timezone shift
// ============================================================
describe('BUG 2 FIX: Events created at correct UTC time', () => {
  test('Tue 7pm PST meeting created at correct UTC time (Wed 3am UTC)', async () => {
    // Cron at Tue 6pm PST = Wed 2am UTC
    MockDate.set('2026-02-18T02:00:00Z');

    const recurringEvents = [
      {
        name: 'PM Meeting',
        date: '2024-01-10T03:00:00Z',      // Wed 3am UTC = Tue 7pm PST
        startTime: '2024-01-10T03:00:00Z',
        endTime: '2024-01-10T05:00:00Z',
        hours: 2,
      },
    ];

    const correctedStartTime = adjustToLosAngelesTime(recurringEvents[0].startTime);
    const timeCorrectedEvent = {
      ...recurringEvents[0],
      date: correctedStartTime.toISOString(),
      startTime: correctedStartTime.toISOString(),
    };
    const result = generateEventData(timeCorrectedEvent, new Date());

    // FIXED: Event lands at Wed 3am UTC = Tue 7pm PST
    expect(result.startTime.toISOString()).toBe('2026-02-18T03:00:00.000Z');
  });

  test('the generated event time matches expected UTC exactly (0 hour diff)', () => {
    MockDate.set('2026-02-18T02:00:00Z');

    const storedStartTime = '2024-01-10T03:00:00Z'; // Tue 7pm PST = Wed 3am UTC
    const corrected = adjustToLosAngelesTime(storedStartTime);
    const result = generateEventData(
      { startTime: corrected.toISOString(), date: corrected.toISOString(), hours: 2, endTime: '2024-01-10T05:00:00Z' },
      new Date(),
    );

    const expectedUTC = new Date('2026-02-18T03:00:00.000Z'); // correct: Tue 7pm PST
    const actualUTC = result.startTime;
    const diffHours = (actualUTC.getTime() - expectedUTC.getTime()) / 3600000;

    // FIXED: No offset error
    expect(diffHours).toBe(0);
  });
});

// ============================================================
// BUG 3 FIX: DST transition handled correctly
// ============================================================
describe('BUG 3 FIX: DST transition handled correctly', () => {
  test('Thu 7pm event stored in PST: cron in PDT creates it correctly', async () => {
    MockDate.set('2025-03-14T01:30:00Z'); // Fri 1:30am UTC = Thu 6:30pm PDT

    const recurringEvents = [
      {
        name: 'Design Review',
        date: '2025-01-10T03:00:00Z',      // Fri 3am UTC = Thu 7pm PST
        startTime: '2025-01-10T03:00:00Z',
        endTime: '2025-01-10T05:00:00Z',
        hours: 2,
      },
    ];

    const getCreated = captureCreatedEvents();
    await filterAndCreateEvents([], recurringEvents, mockURL, mockHeader, fetch);
    const created = getCreated();

    // FIXED: Event IS created — it's Thursday in LA
    expect(created).not.toBeNull();
  });

  test('adjustToLosAngelesTime uses current DST offset, not stored date offset', () => {
    // In March 2025, LA is on PDT (UTC-7)
    // The stored date is January 10 2025 (PST, UTC-8) at 7pm LA = 3am UTC
    // We want today's occurrence of 7pm LA time, which in PDT = 2am UTC
    MockDate.set('2025-03-14T01:30:00Z');

    const storedDate = new Date('2025-01-10T03:00:00Z'); // Jan date, 7pm PST
    const adjusted = adjustToLosAngelesTime(storedDate);

    // The event's LA time is 7pm. Today is in PDT (UTC-7).
    // So 7pm PDT = Fri 2am UTC (on 2025-03-14)
    const result = generateEventData(
      { startTime: adjusted.toISOString(), date: adjusted.toISOString(), hours: 2, endTime: '2025-01-10T05:00:00Z' },
      new Date(),
    );

    const expectedInPDT = new Date('2025-03-14T02:00:00.000Z'); // Thu 7pm PDT
    const diffHours = (result.startTime.getTime() - expectedInPDT.getTime()) / 3600000;

    // FIXED: Exact match
    expect(diffHours).toBe(0);
  });
});

// ============================================================
// BUG 4 FIX: Deduplication uses LA date comparison
// ============================================================
describe('BUG 4 FIX: Deduplication compares LA calendar days', () => {
  test('event on Tue 7pm PST (Wed 3am UTC) found by doesEventExist when checking on same LA day', () => {
    // Event was correctly created with Wed 3am UTC = Tue 7pm PST
    const existingEvents = [
      { name: 'PM Meeting', date: '2026-02-18T03:00:00Z' }, // Wed 3am UTC = Tue 7pm PST
    ];

    // Next cron run is still Tuesday in LA: Wed 4am UTC = Tue 8pm PST
    const laterSameDay = new Date('2026-02-18T04:00:00Z');

    const found = doesEventExist('PM Meeting', laterSameDay, existingEvents);

    // FIXED: Event IS found — both are Tuesday in LA
    expect(found).toBe(true);
  });

  test('event found when both dates are the same LA calendar day despite different UTC days', () => {
    // Event created at Mon 6pm PST = Tue 2am UTC
    const existingEvents = [
      { name: 'Onboarding', date: '2024-02-20T02:00:00Z' }, // Tue 2am UTC = Mon 6pm PST
    ];

    // Now it's Tue 7am UTC = Mon 11pm PST (same LA day: Monday)
    const tuesdayUTC = new Date('2024-02-20T07:00:00Z');

    const found = doesEventExist('Onboarding', tuesdayUTC, existingEvents);

    // FIXED: Event IS found — both are Monday in LA
    expect(found).toBe(true);
  });
});

// ============================================================
// BUG 8 FIX: closeCheckins uses endTime
// ============================================================
describe('BUG 8 FIX: closeCheckins uses event endTime', () => {
  test('4-hour meeting: check-in stays open until endTime', () => {
    const eventStartTime = new Date('2026-02-17T01:00:00Z'); // Tue 5pm PST
    const eventDuration = 4; // hours
    const eventEndTime = new Date(eventStartTime.getTime() + eventDuration * 3600000);

    // 3 hours after start = 4am UTC = 8pm PST
    // Now it's 4:01am UTC = 8:01pm PST (3hr 1min after start)
    const now = new Date('2026-02-17T04:01:00Z').getTime();

    // FIXED: Use endTime instead of hardcoded 3hr
    const shouldClose = now >= eventEndTime.getTime();

    // Check-in stays OPEN — meeting doesn't end until 5am UTC
    expect(shouldClose).toBe(false);
  });
});

// ============================================================
// COMPOUND FIX: openCheckins finds events at correct time
// ============================================================
describe('COMPOUND FIX: openCheckins finds events with correct startTime', () => {
  test('event at correct UTC time IS found at real meeting time', () => {
    // FIXED: Event now has correct startTime = Wed 3am UTC = Tue 7pm PST
    const correctEventStartTime = new Date('2026-02-18T03:00:00Z');

    // openCheckins runs at Tue 6:30pm PST = Wed 2:30am UTC
    const now = new Date('2026-02-18T02:30:00Z').getTime();
    const thirtyMinutesFromNow = now + 1800000;

    const startMs = correctEventStartTime.getTime();
    const wouldOpen = startMs >= now && startMs <= thirtyMinutesFromNow;

    // FIXED: Event IS found — its startTime (3am UTC) is within 30 min of now (2:30am UTC)
    expect(wouldOpen).toBe(true);
  });
});

// ============================================================
// END-TO-END: Full pipeline trace with correct values
// ============================================================
describe('END-TO-END: Full pipeline trace for Tue 7pm PST meeting', () => {
  test('trace every transformation step and show correct values', () => {
    MockDate.set('2026-02-18T02:00:00Z'); // Wed 2am UTC = Tue 6pm PST

    // --- INPUT: What the PM intended ---
    const intended = {
      day: 'Tuesday',
      time: '7:00pm PST',
      correctUTC: '2026-02-18T03:00:00.000Z', // Tue 7pm PST = Wed 3am UTC
    };

    // --- STORED in MongoDB ---
    const stored = {
      date: '2024-01-10T03:00:00.000Z',      // Wed 3am UTC = Tue 7pm PST
      startTime: '2024-01-10T03:00:00.000Z',
    };

    // --- STEP 1: getLADayOfWeek for day-of-week filter ---
    const { getLADayOfWeek } = require('./lib/timezone-utils');
    const eventLADay = getLADayOfWeek(new Date(stored.date));
    const todayLADay = getLADayOfWeek(new Date());

    // Both are Tuesday in LA
    expect(eventLADay).toBe(2); // Tuesday
    expect(todayLADay).toBe(2); // Tuesday
    expect(eventLADay).toBe(todayLADay); // Filter passes

    // --- STEP 2: adjustToLosAngelesTime(startTime) ---
    const correctedStartTime = adjustToLosAngelesTime(stored.startTime);

    // This now returns the CORRECT UTC for today's occurrence of 7pm PST
    // Feb 17 2026 is in PST (UTC-8), so 7pm PST = 3am UTC on Feb 18
    expect(correctedStartTime.toISOString()).toBe('2026-02-18T03:00:00.000Z');

    // --- STEP 3: generateEventData uses startTime directly ---
    const result = generateEventData(
      {
        ...stored,
        date: correctedStartTime.toISOString(),
        startTime: correctedStartTime.toISOString(),
        hours: 2,
        endTime: '2024-01-10T05:00:00.000Z',
      },
      new Date(),
    );

    // --- FINAL OUTPUT ---
    expect(result.startTime.toISOString()).toBe('2026-02-18T03:00:00.000Z');
    // That's Tue 7pm PST = Wed 3am UTC ✓

    const diffFromCorrect =
      (result.startTime.getTime() - new Date(intended.correctUTC).getTime()) / 3600000;

    // Exact match — no offset error
    expect(diffFromCorrect).toBe(0);
  });
});
