/**
 * TIMESTAMP PROOF: Demonstrating where the check-in pipeline breaks
 *
 * This script simulates the exact code path that runs on the AWS ECS server (UTC timezone)
 * for three real-world scenarios that reproduce the bugs reported in issues.
 *
 * Run with: TZ=UTC node .playground/timestamp-proof.js
 * (TZ=UTC simulates the AWS ECS container environment)
 */

// ============================================================
// EXACT COPIES of the functions from the codebase
// ============================================================

// From: backend/workers/createRecurringEvents.js:80-91
const adjustToLosAngelesTime = (eventDate) => {
  const tempDate = new Date(eventDate);
  const losAngelesOffsetHours = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    timeZoneName: 'shortOffset',
  })
    .formatToParts(tempDate)
    .find((part) => part.type === 'timeZoneName')
    .value.slice(3);
  const offsetMinutes = parseInt(losAngelesOffsetHours, 10) * 60;
  return new Date(tempDate.getTime() + offsetMinutes * 60000);
};

// From: backend/workers/lib/generateEventData.js:1-42
function generateEventData(eventObj, TODAY_DATE = new Date()) {
  const eventDate = new Date(eventObj.startTime);
  const hours = eventDate.getHours();
  const minutes = eventDate.getMinutes();
  const seconds = eventDate.getSeconds();
  const milliseconds = eventDate.getMilliseconds();

  const yearToday = TODAY_DATE.getFullYear();
  const monthToday = TODAY_DATE.getMonth();
  const dateToday = TODAY_DATE.getDate();

  const newEventDate = new Date(yearToday, monthToday, dateToday, hours, minutes, seconds, milliseconds);
  const newEndTime = new Date(yearToday, monthToday, dateToday, hours + (eventObj.hours || 2), minutes, seconds, milliseconds);

  return {
    name: eventObj.name,
    date: newEventDate,
    startTime: newEventDate,
    endTime: newEndTime,
    hours: eventObj.hours,
  };
}

// From: backend/workers/createRecurringEvents.js:103-160
// (the relevant filter + transform logic)
function simulateFilterAndCreate(recurringEvent, allEvents, cronRunTime) {
  const today = cronRunTime;
  const todayUTCDay = today.getUTCDay();

  // Step 1: Day-of-week filter (line 113-119)
  const localEventDate = adjustToLosAngelesTime(recurringEvent.date);
  const eventUTCDay = localEventDate.getUTCDay();
  const passesFilter = eventUTCDay === todayUTCDay;

  // Step 2: Time correction (lines 145-151)
  const correctedStartTime = adjustToLosAngelesTime(recurringEvent.startTime);
  const timeCorrectedEvent = {
    ...recurringEvent,
    date: correctedStartTime.toISOString(),
    startTime: correctedStartTime.toISOString(),
  };

  // Step 3: Generate event data (line 153)
  const generatedEvent = generateEventData(timeCorrectedEvent, cronRunTime);

  return { passesFilter, localEventDate, eventUTCDay, todayUTCDay, correctedStartTime, generatedEvent };
}

// From: backend/workers/openCheckins.js:44-68
function simulateOpenCheckinFilter(event, cronRunTime) {
  const now = cronRunTime.getTime();
  const thirtyMinutesFromNow = now + 1800000;
  const startMs = new Date(event.startTime).getTime();
  const passesFilter = startMs >= now && startMs <= thirtyMinutesFromNow && !event.checkInReady;
  return { passesFilter, now, thirtyMinutesFromNow, startMs };
}


// ============================================================
// HELPER
// ============================================================
const fmt = (d) => {
  if (!(d instanceof Date)) d = new Date(d);
  return d.toISOString() + ' (UTC) / ' + d.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }) + ' (LA)';
};
const dayName = (n) => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][n];

function printSection(title) {
  console.log('\n' + '='.repeat(80));
  console.log(title);
  console.log('='.repeat(80));
}

function printStep(step, detail) {
  console.log(`\n--- ${step} ---`);
  if (typeof detail === 'string') console.log(detail);
}


// ============================================================
// SCENARIO 1: Tuesday 7pm PST meeting — Cron runs at Wed 2:00am UTC
// This is the most common case: a normal evening meeting in LA
// ============================================================
printSection('SCENARIO 1: Tuesday 7pm PST meeting, cron at Wed 2am UTC');

console.log(`
SETUP: A PM created a recurring event for "Tuesday 7pm PST".
The frontend sent the timestamp and MongoDB stores it in UTC.
The stored recurring event has:
  date:      2024-01-10T03:00:00.000Z  (Wed 3am UTC = Tue 7pm PST)
  startTime: 2024-01-10T03:00:00.000Z  (same)

The cron runs every 30 min. It's now Tuesday evening in LA,
which is WEDNESDAY morning in UTC.
`);

const scenario1 = {
  recurringEvent: {
    name: 'VRMS PM Meeting',
    date: '2024-01-10T03:00:00.000Z',       // Tue 7pm PST = Wed 3am UTC
    startTime: '2024-01-10T03:00:00.000Z',
    endTime: '2024-01-10T05:00:00.000Z',
    hours: 2,
  },
  // Cron fires at 2:00am UTC Wednesday = 6:00pm PST Tuesday (30 min before event)
  cronTime: new Date('2026-02-18T02:00:00.000Z'), // a Wednesday in UTC, Tuesday in LA
};

printStep('1. Cron fires', `Time: ${fmt(scenario1.cronTime)}`);
console.log(`   today.getUTCDay() = ${scenario1.cronTime.getUTCDay()} (${dayName(scenario1.cronTime.getUTCDay())})`);

const result1 = simulateFilterAndCreate(scenario1.recurringEvent, [], scenario1.cronTime);

printStep('2. adjustToLosAngelesTime(recurringEvent.date)');
console.log(`   Input:  ${fmt(scenario1.recurringEvent.date)}`);
console.log(`   Output: ${fmt(result1.localEventDate)}`);
console.log(`   Output getUTCDay(): ${result1.eventUTCDay} (${dayName(result1.eventUTCDay)})`);

printStep('3. Day-of-week filter comparison');
console.log(`   Event adjusted day: ${result1.eventUTCDay} (${dayName(result1.eventUTCDay)})`);
console.log(`   Today UTC day:      ${result1.todayUTCDay} (${dayName(result1.todayUTCDay)})`);
console.log(`   PASSES FILTER: ${result1.passesFilter}`);

if (!result1.passesFilter) {
  console.log(`\n   *** BUG: Event is SKIPPED. The meeting won't be created today. ***`);
  console.log(`   The cron thinks today is ${dayName(result1.todayUTCDay)} (UTC), but the`);
  console.log(`   adjusted event date resolves to ${dayName(result1.eventUTCDay)}.`);
  console.log(`   A Tuesday 7pm PST meeting will never match when the cron runs`);
  console.log(`   on Wed UTC because todayUTCDay=${result1.todayUTCDay} (Wed) != eventUTCDay=${result1.eventUTCDay} (Tue).`);
} else {
  printStep('4. adjustToLosAngelesTime(startTime) — time correction');
  console.log(`   Input:  ${fmt(scenario1.recurringEvent.startTime)}`);
  console.log(`   Output: ${fmt(result1.correctedStartTime)}`);

  printStep('5. generateEventData — final event created');
  console.log(`   date:      ${fmt(result1.generatedEvent.date)}`);
  console.log(`   startTime: ${fmt(result1.generatedEvent.startTime)}`);
  console.log(`   endTime:   ${fmt(result1.generatedEvent.endTime)}`);

  // Now check if openCheckins would pick it up
  const openResult1 = simulateOpenCheckinFilter(
    { startTime: result1.generatedEvent.startTime, checkInReady: false },
    scenario1.cronTime
  );
  printStep('6. openCheckins filter (would check-in open?)');
  console.log(`   now:               ${fmt(new Date(openResult1.now))}`);
  console.log(`   30min from now:    ${fmt(new Date(openResult1.thirtyMinutesFromNow))}`);
  console.log(`   event startTime:   ${fmt(new Date(openResult1.startMs))}`);
  console.log(`   OPENS CHECK-IN: ${openResult1.passesFilter}`);
}


// ============================================================
// SCENARIO 2: Tuesday 7pm PST meeting — Cron runs at Tue 7:00pm UTC
// What if the cron fires earlier in the UTC day?
// ============================================================
printSection('SCENARIO 2: Same meeting, cron at Tue 7:00pm UTC (Tue 11am PST)');

const scenario2 = {
  recurringEvent: scenario1.recurringEvent,
  cronTime: new Date('2026-02-17T19:00:00.000Z'), // Tue 7pm UTC = Tue 11am PST
};

printStep('1. Cron fires', `Time: ${fmt(scenario2.cronTime)}`);
console.log(`   today.getUTCDay() = ${scenario2.cronTime.getUTCDay()} (${dayName(scenario2.cronTime.getUTCDay())})`);

const result2 = simulateFilterAndCreate(scenario2.recurringEvent, [], scenario2.cronTime);

printStep('2. adjustToLosAngelesTime(recurringEvent.date)');
console.log(`   Input:  ${fmt(scenario2.recurringEvent.date)}`);
console.log(`   Output: ${fmt(result2.localEventDate)}`);
console.log(`   Output getUTCDay(): ${result2.eventUTCDay} (${dayName(result2.eventUTCDay)})`);

printStep('3. Day-of-week filter comparison');
console.log(`   Event adjusted day: ${result2.eventUTCDay} (${dayName(result2.eventUTCDay)})`);
console.log(`   Today UTC day:      ${result2.todayUTCDay} (${dayName(result2.todayUTCDay)})`);
console.log(`   PASSES FILTER: ${result2.passesFilter}`);

if (result2.passesFilter) {
  printStep('4. adjustToLosAngelesTime(startTime) — time correction');
  console.log(`   Input:  ${fmt(scenario2.recurringEvent.startTime)}`);
  console.log(`   Output: ${fmt(result2.correctedStartTime)}`);

  printStep('5. generateEventData — final event created');
  console.log(`   date:      ${fmt(result2.generatedEvent.date)}`);
  console.log(`   startTime: ${fmt(result2.generatedEvent.startTime)}`);
  console.log(`   endTime:   ${fmt(result2.generatedEvent.endTime)}`);

  console.log(`\n   *** EXPECTED: startTime should be Tue 7pm PST = Wed 3am UTC ***`);
  console.log(`   *** ACTUAL:   startTime is ${result2.generatedEvent.startTime.toISOString()} ***`);
  const expectedUTC = new Date('2026-02-18T03:00:00.000Z');
  const actualUTC = result2.generatedEvent.startTime;
  const diffHours = (actualUTC.getTime() - expectedUTC.getTime()) / 3600000;
  console.log(`   *** DIFFERENCE: ${diffHours} hours ***`);

  // Check if openCheckins would pick it up at the CORRECT time (6:30pm PST = 2:30am UTC Wed)
  const correctOpenTime = new Date('2026-02-18T02:30:00.000Z');
  const openResult2 = simulateOpenCheckinFilter(
    { startTime: result2.generatedEvent.startTime, checkInReady: false },
    correctOpenTime
  );
  printStep('6. openCheckins at correct time (Tue 6:30pm PST = Wed 2:30am UTC)');
  console.log(`   now:               ${fmt(new Date(openResult2.now))}`);
  console.log(`   30min from now:    ${fmt(new Date(openResult2.thirtyMinutesFromNow))}`);
  console.log(`   event startTime:   ${fmt(new Date(openResult2.startMs))}`);
  console.log(`   OPENS CHECK-IN: ${openResult2.passesFilter}`);
  if (!openResult2.passesFilter) {
    console.log(`\n   *** BUG: Check-in does NOT open at the correct time ***`);
  }
} else {
  console.log(`\n   *** BUG: Event is SKIPPED even when cron runs on Tuesday UTC ***`);
}


// ============================================================
// SCENARIO 3: DST transition — Meeting created during PST, cron runs during PDT
// PST = UTC-8, PDT = UTC-7
// ============================================================
printSection('SCENARIO 3: DST transition — event stored in PST, cron runs in PDT');

console.log(`
SETUP: A recurring event was created in January (PST, UTC-8) for Thursday 7pm.
  Stored as: 2025-01-10T03:00:00.000Z (Thu 7pm PST = Fri 3am UTC)

Now it's March 13, 2025 (PDT, UTC-7). DST started March 9.
  Thursday 7pm PDT = Friday 2am UTC (not 3am anymore)

The cron runs at what should be 30 min before event start:
  Thu 6:30pm PDT = Fri 1:30am UTC
`);

const scenario3 = {
  recurringEvent: {
    name: 'Weekly Design Review',
    date: '2025-01-10T03:00:00.000Z',       // Thu 7pm PST = Fri 3am UTC
    startTime: '2025-01-10T03:00:00.000Z',
    endTime: '2025-01-10T05:00:00.000Z',
    hours: 2,
  },
  // Cron at Fri 1:30am UTC = Thu 6:30pm PDT (30 min before meeting should start)
  cronTime: new Date('2025-03-14T01:30:00.000Z'),
};

printStep('1. Cron fires', `Time: ${fmt(scenario3.cronTime)}`);
console.log(`   today.getUTCDay() = ${scenario3.cronTime.getUTCDay()} (${dayName(scenario3.cronTime.getUTCDay())})`);
console.log(`   In LA it is: ${scenario3.cronTime.toLocaleString('en-US', { timeZone: 'America/Los_Angeles', weekday: 'long' })}`);

const result3 = simulateFilterAndCreate(scenario3.recurringEvent, [], scenario3.cronTime);

printStep('2. adjustToLosAngelesTime(recurringEvent.date)');
console.log(`   Input:  ${fmt(scenario3.recurringEvent.date)}`);
console.log(`   Output: ${fmt(result3.localEventDate)}`);
console.log(`   Output getUTCDay(): ${result3.eventUTCDay} (${dayName(result3.eventUTCDay)})`);

printStep('3. Day-of-week filter comparison');
console.log(`   Event adjusted day: ${result3.eventUTCDay} (${dayName(result3.eventUTCDay)})`);
console.log(`   Today UTC day:      ${result3.todayUTCDay} (${dayName(result3.todayUTCDay)})`);
console.log(`   PASSES FILTER: ${result3.passesFilter}`);

if (result3.passesFilter) {
  printStep('4. adjustToLosAngelesTime(startTime) — time correction');
  console.log(`   Input:  ${fmt(scenario3.recurringEvent.startTime)}`);
  console.log(`   Stored UTC hour: 03:00 (this was 7pm PST when created)`);
  console.log(`   Output: ${fmt(result3.correctedStartTime)}`);

  printStep('5. generateEventData — final event created');
  console.log(`   date:      ${fmt(result3.generatedEvent.date)}`);
  console.log(`   startTime: ${fmt(result3.generatedEvent.startTime)}`);
  console.log(`   endTime:   ${fmt(result3.generatedEvent.endTime)}`);

  const expectedPDT = new Date('2025-03-14T02:00:00.000Z'); // Thu 7pm PDT = Fri 2am UTC
  const actualUTC3 = result3.generatedEvent.startTime;
  const diffHours3 = (actualUTC3.getTime() - expectedPDT.getTime()) / 3600000;
  console.log(`\n   *** EXPECTED: Thu 7pm PDT = Fri 2:00am UTC (2025-03-14T02:00:00.000Z) ***`);
  console.log(`   *** ACTUAL:   ${actualUTC3.toISOString()} ***`);
  console.log(`   *** DIFFERENCE: ${diffHours3} hours ***`);
} else {
  console.log(`\n   *** BUG: Event skipped due to day-of-week mismatch ***`);
  console.log(`   The event's stored UTC date is on Friday (UTC), but after adjustToLosAngelesTime`);
  console.log(`   it may shift to a different day than expected.`);
}


// ============================================================
// SCENARIO 4: Monday 6pm PST meeting — The "Onboarding" case from issue #1411
// Reported as showing up 25 hours early (Sunday 5pm PST)
// ============================================================
printSection('SCENARIO 4: Monday 6pm PST "Onboarding" — the 25-hours-early bug');

console.log(`
SETUP: Onboarding meeting is Monday 6-9pm PST.
  Stored as: date with Mon 6pm PST = Tue 2am UTC

Bug report: Event appeared Sunday 5pm PST (25 hours early).
Let's see what happens when cron runs on Monday UTC (still Sunday in LA)
and then again on Tuesday UTC (Monday in LA).
`);

const scenario4a = {
  recurringEvent: {
    name: 'Onboarding',
    date: '2024-02-20T02:00:00.000Z',       // Mon 6pm PST = Tue 2am UTC
    startTime: '2024-02-20T02:00:00.000Z',
    endTime: '2024-02-20T05:00:00.000Z',
    hours: 3,
  },
  // Cron fires Monday 8am UTC = Sunday midnight PST
  cronTime: new Date('2024-02-19T08:00:00.000Z'), // Monday UTC, Sunday in LA
};

console.log('\n--- Attempt A: Cron fires Monday 8am UTC (Sunday midnight PST) ---');
console.log(`   Cron time: ${fmt(scenario4a.cronTime)}`);
console.log(`   todayUTCDay: ${scenario4a.cronTime.getUTCDay()} (${dayName(scenario4a.cronTime.getUTCDay())})`);

const result4a = simulateFilterAndCreate(scenario4a.recurringEvent, [], scenario4a.cronTime);
console.log(`   Adjusted event day: ${result4a.eventUTCDay} (${dayName(result4a.eventUTCDay)})`);
console.log(`   PASSES FILTER: ${result4a.passesFilter}`);

if (result4a.passesFilter) {
  console.log(`   Generated startTime: ${fmt(result4a.generatedEvent.startTime)}`);
  console.log(`   *** This is ${dayName(result4a.generatedEvent.startTime.getUTCDay())} in UTC ***`);
  console.log(`   *** In LA: ${result4a.generatedEvent.startTime.toLocaleString('en-US', { timeZone: 'America/Los_Angeles', weekday: 'long', hour: 'numeric', minute: 'numeric' })} ***`);
  console.log(`   *** BUG: Event created on WRONG DAY — should be Monday 6pm PST ***`);
}

const scenario4b = {
  recurringEvent: scenario4a.recurringEvent,
  // Cron fires Tuesday 8am UTC = Monday midnight PST
  cronTime: new Date('2024-02-20T08:00:00.000Z'), // Tuesday UTC, Monday in LA
};

console.log('\n--- Attempt B: Cron fires Tuesday 8am UTC (Monday midnight PST) ---');
console.log(`   Cron time: ${fmt(scenario4b.cronTime)}`);
console.log(`   todayUTCDay: ${scenario4b.cronTime.getUTCDay()} (${dayName(scenario4b.cronTime.getUTCDay())})`);

const result4b = simulateFilterAndCreate(scenario4b.recurringEvent, [], scenario4b.cronTime);
console.log(`   Adjusted event day: ${result4b.eventUTCDay} (${dayName(result4b.eventUTCDay)})`);
console.log(`   PASSES FILTER: ${result4b.passesFilter}`);

if (result4b.passesFilter) {
  console.log(`   Generated startTime: ${fmt(result4b.generatedEvent.startTime)}`);
} else {
  console.log(`   *** Event skipped — won't be created on this pass ***`);
}


// ============================================================
// SUMMARY
// ============================================================
printSection('SUMMARY OF BUGS PROVEN');

console.log(`
BUG 1 — DAY-OF-WEEK MISMATCH (Scenarios 1, 4)
  The filter compares today.getUTCDay() with adjustToLosAngelesTime(event.date).getUTCDay().
  But "today" in UTC can be a DIFFERENT day than "today" in LA.

  Example: It's Tuesday 8pm in LA = Wednesday 4am in UTC.
    - todayUTCDay = 3 (Wednesday)
    - A Tuesday event adjusted to LA time has getUTCDay() = 2 (Tuesday)
    - 3 !== 2 → event is SKIPPED

  This means any evening event in LA (after ~4pm PST / ~5pm PDT) will FAIL
  to be created when the cron runs during the UTC "next day" window
  (midnight-8am UTC = 4pm-midnight PST).

BUG 2 — DOUBLE TIMEZONE SHIFT (Scenarios 2, 3)
  adjustToLosAngelesTime shifts a UTC date by the LA offset (e.g., -8 hours for PST).
  The result is a Date object whose UTC representation now looks like LA local time.

  Then generateEventData calls .getHours() on this shifted date.
  On a UTC server, .getHours() === .getUTCHours(), so it reads the
  ALREADY-SHIFTED value and treats it as a local hour.

  Then new Date(year, month, day, hours, ...) interprets those hours as
  the server's local timezone (UTC on AWS), creating the final timestamp.

  Net effect: The time shift is applied correctly by adjustToLosAngelesTime,
  but then generateEventData may re-interpret it depending on server TZ.

BUG 3 — DST TRANSITION (Scenario 3)
  adjustToLosAngelesTime correctly detects the CURRENT DST offset at runtime.
  But the stored recurring event timestamp was created with the OLD offset.

  Example: Stored 3am UTC (= 7pm PST at creation during winter).
  After DST: adjustToLosAngelesTime gets offset -7 (PDT), shifts to -7 hours.
  3am UTC - 7h = 8pm UTC-representation. getUTCHours() = 20.
  But the meeting should still be at 7pm LA time = 2am UTC in PDT.

  The function "corrects" for the current DST but the original timestamp
  already had the old DST baked in, causing a 1-hour drift.

BUG 4 — isSameUTCDate DUPLICATE CHECK (All scenarios)
  doesEventExist uses isSameUTCDate to check if an event was already created.
  But if the generated event's date ends up on the wrong UTC day (Bug 1/2),
  the duplicate check may fail to match, allowing duplicate events to be
  created on subsequent cron runs.
`);
