# Check-In System: Full Workflow & Where It Breaks

> Generated 2026-02-16. Proven with `TZ=UTC node .playground/timestamp-proof.js`

---

## The Full Current Workflow

There are 3 cron jobs that run every 30 minutes on the AWS ECS container (which runs in **UTC timezone**). Together they manage the lifecycle of a meeting check-in.

### Phase 1: Event Creation (`createRecurringEvents.js`)

**What it does:** Turns recurring event templates into concrete event instances for today.

```
┌─────────────────────┐     ┌──────────────────────────────────────────────────────────┐
│  RecurringEvent      │     │  createRecurringEvents cron (every 30 min)               │
│  (MongoDB template)  │     │                                                          │
│                      │     │  1. Fetch all recurring events from API                   │
│  name: "PM Meeting"  │────▶│  2. Fetch all existing events from API                    │
│  date: (stored UTC)  │     │  3. For each recurring event:                             │
│  startTime: (UTC)    │     │     a. adjustToLosAngelesTime(date)                       │
│  hours: 2            │     │     b. Compare adjusted day with today's UTC day          │
│                      │     │     c. Check if event already exists (isSameUTCDate)      │
│                      │     │     d. If match + not exists:                             │
│                      │     │        - adjustToLosAngelesTime(startTime)                │
│                      │     │        - generateEventData() to build today's instance    │
│                      │     │     e. Batch POST all new events                          │
│                      │     │                                                          │
└─────────────────────┘     └───────────────────────┬──────────────────────────────────┘
                                                    │
                                                    ▼
                                        ┌───────────────────────┐
                                        │  Event (MongoDB)       │
                                        │                        │
                                        │  name: "PM Meeting"    │
                                        │  date: (today, UTC)    │
                                        │  startTime: (UTC)      │
                                        │  checkInReady: false   │
                                        └───────────────────────┘
```

### Phase 2: Opening Check-Ins (`openCheckins.js`)

**What it does:** Flips `checkInReady` to `true` for events starting within the next 30 minutes.

```
┌───────────────────────┐     ┌──────────────────────────────────────────────────────┐
│  Event (MongoDB)       │     │  openCheckins cron (every 30 min)                     │
│                        │     │                                                      │
│  checkInReady: false   │────▶│  1. Fetch all events from API                         │
│  date: 2026-02-17     │     │  2. For each event:                                   │
│  startTime: (UTC)      │     │     now = Date.now()                                  │
│                        │     │     thirtyMin = now + 1800000                          │
│                        │     │     Filter: startTime >= now                           │
│                        │     │             && startTime <= thirtyMin                  │
│                        │     │             && checkInReady === false                  │
│                        │     │  3. Batch PATCH matching events: checkInReady = true   │
│                        │     │                                                      │
└───────────────────────┘     └──────────────────────────────────────────────────────┘
```

### Phase 3: Closing Check-Ins (`closeCheckins.js`)

**What it does:** Flips `checkInReady` to `false` for events that started 3+ hours ago.

```
┌───────────────────────┐     ┌──────────────────────────────────────────────────────┐
│  Event (MongoDB)       │     │  closeCheckins cron (every 30 min)                    │
│                        │     │                                                      │
│  checkInReady: true    │────▶│  1. Fetch all events from API                         │
│  date: 2026-02-17     │     │  2. For each event:                                   │
│  startTime: (UTC)      │     │     threeHrsAfterStart = startTime + 10800000         │
│                        │     │     Filter: now >= threeHrsAfterStart                 │
│                        │     │             && checkInReady === true                   │
│                        │     │  3. Batch PATCH matching events: checkInReady = false  │
│                        │     │                                                      │
└───────────────────────┘     └──────────────────────────────────────────────────────┘
```

### Phase 4: User Check-In (Frontend)

```
User visits /checkin
  → Frontend fetches events where checkInReady === true
  → User sees dropdown of available meetings
  → User selects meeting, enters email
  → POST /api/checkins/ creates CheckIn document
```

---

## Where The System Breaks

There are **4 distinct bugs** in this pipeline, all proven with concrete timestamps. Run `TZ=UTC node .playground/timestamp-proof.js` to reproduce.

---

### BUG 1: Day-of-Week Mismatch — Events Not Created

**Where:** `createRecurringEvents.js` lines 104-121
**Severity:** Critical — events silently never get created

**The code:**
```js
const today = new Date();
const todayUTCDay = today.getUTCDay();                              // UTC day
const localEventDate = adjustToLosAngelesTime(recurringEvent.date); // shifted to LA
return localEventDate.getUTCDay() === todayUTCDay;                  // comparing apples to oranges
```

**The problem:** `todayUTCDay` is the day in **UTC**, but after 4pm PST (midnight UTC), the UTC day is **one day ahead** of the LA day. The adjusted event date correctly reflects the LA day, but it's being compared against the wrong reference.

**Proof — "VRMS PM Meeting" Tuesday 7pm PST:**

| | Value |
|---|---|
| Stored in MongoDB | `2024-01-10T03:00:00.000Z` (Wed 3am UTC = Tue 7pm PST) |
| Cron runs at | Tue 6pm PST = **Wed** 2am UTC |
| `todayUTCDay` | **3 (Wednesday)** |
| `adjustToLosAngelesTime(date).getUTCDay()` | **2 (Tuesday)** |
| Result | **3 !== 2 → SKIPPED** |

The meeting is never created. The cron would need to have run earlier on Tuesday UTC (before midnight UTC = before 4pm PST) to match. But by that point, the meeting is still 3+ hours away and may be created with incorrect times (see Bug 2).

**Impact window:** Any meeting after ~4pm PST will be affected by this for all cron runs between midnight-8am UTC (4pm PST - midnight PST). This is exactly the window when evening meetings need to be created.

---

### BUG 2: 8-Hour Time Shift — Events Created at Wrong Time

**Where:** `createRecurringEvents.js` lines 145-151 + `generateEventData.js` lines 6-17
**Severity:** Critical — events appear at wrong time in check-in dropdown

**The chain of transformations:**

```
Stored startTime:           2024-01-10T03:00:00.000Z  (Tue 7pm PST = Wed 3am UTC)
                                    │
                                    ▼
adjustToLosAngelesTime():   2024-01-09T19:00:00.000Z  (shifts -8h for PST)
                                    │                   This is the LA time "embedded"
                                    │                   into a UTC Date object
                                    ▼
.toISOString():             "2024-01-09T19:00:00.000Z" (passed as startTime string)
                                    │
                                    ▼
generateEventData():        new Date("2024-01-09T19:00:00.000Z")
                            .getHours() → 19           (on UTC server, getHours = getUTCHours)
                                    │
                                    ▼
new Date(2026, 1, 17, 19, 0, 0, 0) → 2026-02-17T19:00:00.000Z
                                    │
                                    ▼
FINAL EVENT startTime:      2026-02-17T19:00:00.000Z  = Tue 11:00am PST
                                                        (SHOULD BE Tue 7pm PST)
```

**Proof:**

| | Expected | Actual |
|---|---|---|
| startTime in UTC | `2026-02-18T03:00:00.000Z` | `2026-02-17T19:00:00.000Z` |
| startTime in LA | Tue 7:00pm PST | **Tue 11:00am PST** |
| Difference | | **-8 hours** |

The event is created 8 hours too early. This is the PST offset (-8) being applied once by `adjustToLosAngelesTime`, then the shifted value being read as-is by `generateEventData` on a UTC server where `.getHours()` returns UTC hours.

**What the user sees:** The meeting shows up in the check-in dropdown at 11am instead of 7pm, or doesn't show up at all because `openCheckins` looks for events starting within the next 30 minutes and the time is completely wrong.

---

### BUG 3: DST Transition — 1-Hour Drift After Clocks Change

**Where:** `adjustToLosAngelesTime()` line 80-91
**Severity:** Medium — events off by 1 hour twice a year until manually corrected

**The problem:** `adjustToLosAngelesTime` dynamically detects the **current** DST offset. But the stored recurring event timestamp was created with the **old** DST offset baked in.

**Proof — Event created in January (PST, UTC-8), cron runs in March (PDT, UTC-7):**

```
Stored:     2025-01-10T03:00:00.000Z     (Thu 7pm PST → stored as Fri 3am UTC)
                                          Created with offset -8 baked in

adjustToLosAngelesTime in March:
  Current offset: -7 (PDT)
  3am UTC + (-7 * 60min) = 3am - 7h = 8pm previous day UTC-representation
  getUTCHours() = 20

generateEventData:
  .getHours() = 20 on UTC server
  Creates event at 8pm UTC = 1pm PDT

EXPECTED: 7pm PDT = 2am UTC next day
ACTUAL:   8pm UTC = 1pm PDT
DIFFERENCE: 6 hours off
```

But actually, the bug compounds with Bug 1 — in this scenario the day-of-week filter fails first (cron at Fri 1:30am UTC, todayUTCDay=Fri, adjusted event day=Thu → **skipped**), so the event is never created at all.

**What the user sees:** After DST transitions in March and November, meetings either don't appear or appear 1 hour off from their scheduled time.

---

### BUG 4: Duplicate Events — Failed Deduplication

**Where:** `doesEventExist()` + `isSameUTCDate()` lines 55-73
**Severity:** Medium — duplicate entries in check-in dropdown

**The code:**
```js
const doesEventExist = (recurringEventName, today, events) =>
  events.some((event) => {
    const eventDate = new Date(event.date);
    return isSameUTCDate(eventDate, today) && event.name === recurringEventName;
  });
```

**The problem:** Due to Bug 2, events get created with dates on the **wrong UTC day**. On subsequent cron runs, `isSameUTCDate` compares the wrongly-dated event against `today` (in UTC) and may fail to find a match, creating the event **again**.

**Example:**
1. Cron runs at Tue 11am UTC → creates "PM Meeting" with date `2026-02-17T19:00:00.000Z` (Tue)
2. Cron runs at Tue 11:30am UTC → `today` is still Tue → `isSameUTCDate` finds match → OK, no duplicate
3. Cron runs at Wed 2am UTC → `today` is Wed → looks for event on Wed → **doesn't find Tue's event** → creates duplicate

---

## The Root Cause

All four bugs stem from a single architectural issue: **the system mixes UTC and LA-local time representations inconsistently**.

```
              adjustToLosAngelesTime()          generateEventData()

UTC Date ──────────▶ "Fake UTC" Date ──────────▶ .getHours() reads as UTC
(real UTC)           (LA time values in          (on UTC server)
                      UTC Date wrapper)
                                                  new Date(y,m,d,h) creates
                                                  in server local TZ (UTC)

                                                  Result: UTC timestamp where
                                                  the hours = LA hours
                                                  (shifted by -8 or -7)
```

`adjustToLosAngelesTime` creates a **hybrid Date** — a Date object whose UTC values represent LA local time. This is a common anti-pattern. It only works if every downstream consumer knows they're working with this "fake UTC" convention, but `generateEventData` doesn't — it uses `.getHours()` which on a UTC server returns the UTC hours (which are now the fake-LA hours).

The day-of-week comparison has the inverse problem: it correctly converts the event to LA day, but compares it against `today.getUTCDay()` — the UTC day — instead of today's day in LA.

---

## What A Fix Would Need

1. **One consistent timezone strategy.** Either:
   - Store everything in UTC and convert to LA **only at display time** in the frontend, OR
   - Always use `Intl.DateTimeFormat` with `timeZone: 'America/Los_Angeles'` to extract day/hour for comparisons

2. **Fix the day-of-week comparison.** `today` needs to be evaluated in LA time too:
   ```js
   // Instead of: today.getUTCDay()
   // Use something like:
   const todayInLA = new Date(today.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }));
   const todayLADay = todayInLA.getDay();
   ```

3. **Fix `generateEventData`.** Use `getUTCHours()`/`setUTCHours()` explicitly, or don't pre-shift the input at all — just extract the LA wall-clock time and construct the correct UTC timestamp directly.

4. **Fix the duplicate check.** `isSameUTCDate` should compare in LA-local dates, not UTC dates, since events are conceptually happening on LA-local days.

---

## Files Involved

| File | Line(s) | Bug |
|---|---|---|
| `backend/workers/createRecurringEvents.js` | 104-105 | Bug 1: `todayUTCDay` vs LA-adjusted day |
| `backend/workers/createRecurringEvents.js` | 80-91 | Bug 2, 3: `adjustToLosAngelesTime` hybrid Date |
| `backend/workers/createRecurringEvents.js` | 145-151 | Bug 2: passes shifted Date to generateEventData |
| `backend/workers/lib/generateEventData.js` | 8 | Bug 2: `.getHours()` on shifted Date in UTC server |
| `backend/workers/createRecurringEvents.js` | 55-61, 69-73 | Bug 4: `isSameUTCDate` on wrong-day events |
| `backend/workers/openCheckins.js` | 61-63 | Downstream: compares wrong startTime against `now` |
