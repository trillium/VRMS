# Meeting Check-In Bug: Research & Findings

> Compiled: 2026-02-16
> Sources: GitHub Issues, PRs, code review, issue comments

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Timeline](#timeline)
3. [Root Causes Identified](#root-causes-identified)
4. [Key Issues (Open)](#key-issues-open)
5. [Key Issues (Closed/Resolved)](#key-issues-closedresolved)
6. [Key PRs](#key-prs)
7. [Architecture: How Check-Ins Work](#architecture-how-check-ins-work)
8. [Bug Symptoms Observed](#bug-symptoms-observed)
9. [Fixes Applied So Far](#fixes-applied-so-far)
10. [Remaining Problems](#remaining-problems)
11. [Relevant Code Files](#relevant-code-files)

---

## Executive Summary

The VRMS meeting check-in feature has had a long-running cluster of bugs spanning from 2021 to present. The core issue is that **events are not reliably available for check-in at their scheduled times**. This manifests as:

- Events appearing at wrong times (off by hours or even a full day)
- Events not being generated at all
- Check-ins not opening automatically when they should
- Duplicate events appearing in the check-in dropdown
- OOM crashes in production killing the cron workers that manage check-ins

The bugs stem from **multiple interrelated causes** including timezone handling (GMT vs Pacific), daylight savings time transitions, a frontend date utility bug, and backend cron worker memory issues.

As of February 2026, the OOM issue has been fixed (PR #2079), but **timezone/timing issues may still persist** and require further testing after Dev/Prod rebuilds.

---

## Timeline

| Date | Event |
|------|-------|
| **2021-06** | Early check-in bugs reported: meetings not displaying (#612), route broken (#601) |
| **2022-07** | Fix for missing body in open/close checkins (#1167) |
| **2023-03** | Issue #1376 opened: event times not matching check-in times |
| **2023-03** | PR #1375: Add project name to dropdown and fix check-in bug |
| **2023-05** | PR #1395: Recurring event bug fix |
| **2023-07** | Issue #1411 opened: "Bug: Users Cannot Check In" - events not appearing for check-in |
| **2023-07** | PR #1413: Fix events not showing up for checkin |
| **2023-07** | PR #1420: Fix hardcoded localhost in openCheckins |
| **2023-08** | Issue #1530 opened: Guides team meeting not available for checkin |
| **2024-02** | Issue #1411 reopened: check-in times still incorrect, events showing up a day early |
| **2024-02** | Trillium identifies frontend bug in `findNextOccuranceOfDay.js` |
| **2024-04** | Onboarding event not generated on time, DST causing 1-hour offset |
| **2024-10** | Bug still ongoing: PM meeting not available, Product Management CoP off by 1 hour |
| **2025-01** | Report: meeting updates not persisting after first update |
| **2025-01** | Trillium explains the core timezone issue: GMT vs PST date creation |
| **2025-02** | Epic #1838 created to track all check-in bugs |
| **2025-02** | Issue #1872: Investigate and Fix Incorrect Event Check-In Times |
| **2025-03** | Kurt's fix deployed to Dev, but testing shows problems persist |
| **2025-03** | Testing shows events available at wrong times (e.g., 9-11am instead of 5-7:30pm) |
| **2026-01** | Ganesh identifies OOM as reason cron jobs fail in prod (PR #2079) |
| **2026-02** | PR #2079 merged: batch operations to prevent OOM |
| **2026-02** | Waiting on Dev/Prod rebuild to test end-to-end |

---

## Root Causes Identified

### 1. Timezone Mismatch (GMT vs Pacific) - CORE ISSUE

**Status: Partially understood, fix in progress**

The backend stores timestamps in GMT. When the `createRecurringEvents` cron job generates new event instances, it:
1. Takes the recurring event's stored hour (in GMT)
2. Creates a new Date object for "today"
3. Sets the hour to match the stored recurring event hour

The problem: if the stored timestamp's date was created in a different timezone context, the hour assignment produces an incorrect time. This can result in events being off by ~8 hours (PST offset) or even appearing on the wrong day.

**From trillium's analysis (Issue #1411):**
> "We have accurate timestamps for when the event should start, but the timestamp's date creation is happening sometimes on the day before because of timezone differences between Pacific Time and GMT."

### 2. Frontend Date Utility Bug

**Status: Identified by trillium (2024-02)**

In `client/src/components/manageProjects/utilities/findNextDayOccuranceOfDay.js`:

```js
export const findNextOccuranceOfDay = (dayOfTheWeek) => {
  let day = parseInt(dayOfTheWeek);
  const date = new Date(); // BUG: Creates date from current time, losing previous event date info
  date.setDate(date.getDate() + ((7 - date.getDay()) % 7 + day) % 7);
  return date;
}
```

When editing meeting times (`editMeetingTimes.js`), the day update creates a new Date from `new Date()` instead of preserving the existing event's date/time information. This overwrites all previous date info with the current time.

### 3. Daylight Savings Time (DST)

**Status: Known, not yet fixed**

Events are assumed to be in Los Angeles timezone. When DST transitions occur, stored timestamps don't get adjusted, causing a 1-hour offset. Per Bonnie: "It's okay to assume all events are on Los Angeles timezone."

### 4. Cron Worker OOM Crashes (Production)

**Status: FIXED (PR #2079)**

The cron workers (`openCheckins.js`, `closeCheckins.js`, `createRecurringEvents.js`) were making individual HTTP requests per event inside `forEach` loops. In production with many events, this caused out-of-memory crashes, silently preventing events from being generated or opened for check-in.

**From Ganesh's investigation (Issue #1872):**
> "When the cron jobs are scheduled, I see the api call, and next to it, I see the process got killed. 'OutOfMemoryError: Container killed due to memory usage'"

### 5. Slow Cron Processing Window

**Status: Not addressed**

The cron jobs run every 30 minutes and process thousands of events. vanessavun suggested the processing time itself may cause events to be missed if they fall at boundary times (exactly on the hour or half-hour).

---

## Key Issues (Open)

### #1838 - Epic: Check in bug tracker and resolution
- **Status:** OPEN
- **Purpose:** Master tracker for all check-in related bugs
- **Checklist items pending:**
  - Rebuild DEV with latest fix
  - Test on Dev and check logs
  - Rebuild PROD with changes from DEV
  - Test on PROD and check logs
  - Close remaining open issues after testing

### #1411 - Bug: Users Cannot Check In
- **Status:** OPEN (reopened multiple times)
- **Original report:** No events showing as "Check-in ready"
- **History:** Opened 2023-07, has been reopened multiple times as fixes proved incomplete
- **Next steps per trillium:**
  - Employ test-driven development
  - Refactor `createRecurringEvents` into smaller testable functions
  - Fix timezone handling so DST transitions work correctly

### #1530 - The Guides team meeting is not available for checkin
- **Status:** OPEN
- **Linked to:** #1411 and #1376
- **Workaround provided:** PMs can manually enable check-in via "Manually Edit Events Checkin" feature

### #1597 - Review and refine User Check In page UI
- **Status:** OPEN (UI refinement, separate from the bug)

---

## Key Issues (Closed/Resolved)

### #1872 - Investigate and Fix Incorrect Event Check-In Times
- **Status:** CLOSED
- **Resolution:** Ganesh identified OOM as root cause in prod, fixed via batching (PR #2079)
- **Note:** This fixed the OOM issue but the underlying timezone bug may still exist

### #1376 - Event times not matching check-in times
- **Status:** CLOSED
- **Investigation:** Multiple contributors confirmed DB times are sometimes correct but display times are wrong; some recurring events stored with wrong day

### #1424 - Backend creating duplicates for event checkins
- **Status:** CLOSED

### #1165 - Incorrect meetings displayed in checkin page
- **Status:** CLOSED

### #601 - checkIn route in client is broken
- **Status:** CLOSED

### #251 - 400 Bad Request from `/checkins/findEvent/:id`
- **Status:** CLOSED

---

## Key PRs

| PR | Title | Status | Impact |
|----|-------|--------|--------|
| **#2079** | Fix: prevent cron worker OOM by batching recurring check-in operations | MERGED (2026-01-31) | Changed forEach+fetch to batch operations, preventing OOM crashes |
| **#1906** | Unit Testing for CheckIns Router | MERGED (2025-04-22) | Added test coverage for check-in endpoints |
| **#1413** | Fix events not showing up for checkin | MERGED (2023-07-11) | Fixed events not appearing in check-in dropdown |
| **#1420** | Fix: Update openCheckins to use env var | MERGED (2023-07-12) | Fixed hardcoded localhost in cron worker |
| **#1395** | Recurring event bug fix | MERGED (2023-05-26) | Fixed recurring event generation |
| **#1375** | Add project name to dropdown and fix check-in bug | MERGED (2023-03-29) | UI improvement + bug fix |
| **#1167** | Fix: missing body for open and close checkins | MERGED (2022-07-22) | Fixed API payload issue |
| **#612** | Checkin bug: meetings not displaying | MERGED (2021-07-05) | Early fix for display bug |

---

## Architecture: How Check-Ins Work

### Data Flow

```
RecurringEvent (template) --> createRecurringEvents cron --> Event (instance)
                                                              |
                                              openCheckins cron --> sets checkInReady=true
                                                              |
                                              User visits /checkin --> sees available events
                                                              |
                                              User submits form --> CheckIn document created
                                                              |
                                              closeCheckins cron --> sets checkInReady=false
```

### Cron Jobs (run every 30 minutes)

1. **`createRecurringEvents.js`** - Checks recurring events, creates new Event instances for today's events
2. **`openCheckins.js`** - Opens check-in 30 minutes before event start time
3. **`closeCheckins.js`** - Closes check-in 3 hours after event start time

### Key Models

- **RecurringEvent** - Template with day of week, start/end times, project association
- **Event** - Instance of a meeting on a specific date, has `checkInReady` boolean
- **CheckIn** - Record of a user checking into an event (`userId`, `eventId`, `checkedIn`, `createdDate`)

### Key API Endpoints

- `GET /api/checkins/` - List all check-ins
- `GET /api/checkins/findEvent/:id` - Get check-ins for a specific event
- `POST /api/checkins/` - Create a new check-in
- `PATCH /api/events/batchUpdate` - Batch update events (open/close check-ins)

---

## Bug Symptoms Observed

1. **Events available at wrong times** - e.g., a 5-7:30pm CDT meeting showing as available at 9-11am
2. **Events appearing a day early** - e.g., Onboarding (Monday 6-9pm) showing Sunday 5-8pm
3. **Events not generated at all** - cron job silently failing due to OOM
4. **Duplicate events** in the check-in dropdown (same meeting showing this week and last week)
5. **1-hour DST offset** - events consistently off by 1 hour after DST transitions
6. **Meeting updates not persisting** - editing a meeting works once then stops reflecting changes
7. **VRMS freezing** during cron processing due to heavy database queries

---

## Fixes Applied So Far

### 1. Batch Operations (PR #2079) - MERGED
- Converted `openCheckins.js`, `closeCheckins.js`, and `createRecurringEvents.js` from per-event HTTP requests to batch operations
- Backend `event.controller.js` updated to accept arrays for bulk `Event.bulkWrite()`
- Eliminates OOM crashes in production

### 2. Various Earlier Fixes
- Fixed hardcoded localhost (#1420)
- Fixed missing request body (#1167)
- Fixed events not appearing in dropdown (#1413)
- Added project name to dropdown (#1375)
- Multiple UI/UX improvements

---

## Remaining Problems

### High Priority
1. **Timezone handling in `createRecurringEvents.js`** - The core issue of GMT vs Pacific time date creation is not fully resolved. Needs TDD approach with unit tests covering DST transitions.
2. **Frontend `findNextOccuranceOfDay.js` bug** - Uses `new Date()` instead of preserving existing event date context when editing meeting times.
3. **DST transition handling** - No mechanism to adjust stored timestamps when DST changes occur.

### Medium Priority
4. **End-to-end validation needed** - Dev and Prod need to be rebuilt with latest fixes and thoroughly tested.
5. **Cron timing window** - Events at boundary times (exactly on the hour/half-hour) may be missed by the 30-minute cron cycle.

### Next Steps (from Epic #1838)
- [ ] Rebuild DEV with latest fix
- [ ] Test on Dev and check logs to confirm events are available for check-in on time
- [ ] Rebuild PROD with changes from DEV
- [ ] Test on PROD and check logs to confirm events are available for check-in on time
- [ ] Close remaining open issues after testing and confirmation

---

## Relevant Code Files

### Backend
| File | Purpose |
|------|---------|
| `backend/workers/createRecurringEvents.js` | Cron: creates event instances from recurring templates |
| `backend/workers/openCheckins.js` | Cron: opens check-ins before event start |
| `backend/workers/closeCheckins.js` | Cron: closes check-ins after event end |
| `backend/controllers/event.controller.js` | Event CRUD + batch update logic |
| `backend/models/checkIn.model.js` | CheckIn mongoose schema |
| `backend/models/recurringEvent.model.js` | RecurringEvent mongoose schema |
| `backend/routers/checkIns.router.js` | Check-in REST endpoints |
| `backend/routers/events.router.js` | Event REST endpoints |

### Frontend
| File | Purpose |
|------|---------|
| `client/src/pages/CheckInForm.jsx` | Main check-in form page |
| `client/src/pages/Event.jsx` | Event details with check-in |
| `client/src/components/presentational/CheckInButtons.jsx` | Check-in action buttons |
| `client/src/components/presentational/newUserForm.jsx` | New user check-in flow |
| `client/src/components/presentational/returnUserForm.jsx` | Returning user check-in flow |
| `client/src/components/manageProjects/editMeetingTimes.js` | Meeting time editor (contains bug) |
| `client/src/components/manageProjects/utilities/findNextDayOccuranceOfDay.js` | Date utility (contains bug) |

### Tests
| File | Purpose |
|------|---------|
| `backend/routers/checkIns.router.test.js` | Unit tests for check-in router |
| `backend/routers/checkUser.router.test.js` | Unit tests for user lookup |

---

## GitHub References

- **Epic tracker:** https://github.com/hackforla/VRMS/issues/1838
- **Main bug issue:** https://github.com/hackforla/VRMS/issues/1411
- **Guides team issue:** https://github.com/hackforla/VRMS/issues/1530
- **Check-in times investigation:** https://github.com/hackforla/VRMS/issues/1872
- **Earlier investigation:** https://github.com/hackforla/VRMS/issues/1376
- **OOM fix PR:** https://github.com/hackforla/VRMS/pull/2079
