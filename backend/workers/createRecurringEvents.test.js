const {
  fetchData,
  adjustToLosAngelesTime,
  isSameUTCDate,
  doesEventExist,
  createEvents,
  filterAndCreateEvents,
  runTask,
  scheduleTask,
} = jest.requireActual('./createRecurringEvents');

const MockDate = require('mockdate');
const cron = require('node-cron');

jest.mock('node-fetch', () => jest.fn());
const fetch = require('node-fetch');

describe('createRecurringEvents Module Tests', () => {
  const mockURL = 'http://localhost:3000';
  const mockHeader = 'mock-header';
  let mockEvents;
  let mockRecurringEvents;

  fetch.mockResolvedValue({
    ok: true,
    json: jest.fn().mockResolvedValue(mockEvents),
  });

  beforeEach(() => {
    MockDate.set('2023-11-02T00:00:00Z');

    mockEvents = [
      { name: 'Event 1', date: '2023-11-02T19:00:00Z' },
      { name: 'Event 2', date: '2023-11-02T07:00:00Z' },
    ];
    mockRecurringEvents = [
      { name: 'Event 1', date: '2023-11-02T19:00:00Z' },
      { name: 'Event 2', date: '2023-11-02T07:00:00Z' },
      { name: 'Event 3', date: '2023-11-03T07:00:00Z' }, // Does not match today
    ];

    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.clearAllMocks();
    MockDate.reset();
  });

  describe('fetchData', () => {
    it('should fetch data from the API endpoint', async () => {
      fetch.mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue(mockEvents),
      });

      const result = await fetchData('/api/events/', mockURL, mockHeader, fetch);

      expect(fetch).toHaveBeenCalledWith(`${mockURL}/api/events/`, {
        headers: { 'x-customrequired-header': mockHeader },
      });
      expect(result).toEqual(mockEvents);
    });

    it('should handle API fetch failures', async () => {
      fetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await fetchData('/api/events/', mockURL, mockHeader, fetch);

      expect(fetch).toHaveBeenCalledTimes(1);
      expect(result).toEqual([]);
    });
  });

  describe('adjustToLosAngelesTime', () => {
    it('should return correct UTC for a PST event time on today\'s date', () => {
      // MockDate is 2023-11-02T00:00:00Z = Nov 1 at 5pm PDT
      // Stored event: 2024-03-10T07:00:00Z. In LA, Mar 9 2024 is PST (UTC-8).
      // 7am UTC = Mar 9 at 11pm PST. We extract 11pm.
      // Today is Nov 1 2023 in LA (PDT, UTC-7). 11pm PDT = 6am UTC Nov 2.
      MockDate.set('2023-11-02T00:00:00Z');

      const utcTimestamp = new Date('2024-03-10T07:00:00Z');
      const result = adjustToLosAngelesTime(utcTimestamp);

      expect(result.toISOString()).toBe('2023-11-02T06:00:00.000Z');
    });

    it('should return correct UTC for a PDT event time on today\'s date', () => {
      MockDate.set('2024-03-11T07:00:00Z'); // Mar 11 at midnight PDT

      const utcTimestamp = new Date('2024-03-11T07:00:00Z');
      const result = adjustToLosAngelesTime(utcTimestamp);

      expect(result.toISOString()).toBe('2024-03-11T07:00:00.000Z');
    });

    it('should return correct UTC for a PST event time after DST ends', () => {
      MockDate.set('2024-11-10T08:00:00Z'); // Nov 10 at midnight PST

      const utcTimestamp = new Date('2024-11-10T08:00:00Z');
      const result = adjustToLosAngelesTime(utcTimestamp);

      expect(result.toISOString()).toBe('2024-11-10T08:00:00.000Z');
    });

    it('should handle DST-end transition correctly', () => {
      MockDate.set('2024-11-03T09:00:00Z'); // Nov 3 at 1am PST

      const utcTimestamp = new Date('2024-11-03T09:00:00Z');
      const result = adjustToLosAngelesTime(utcTimestamp);

      expect(result.toISOString()).toBe('2024-11-03T09:00:00.000Z');
    });

    it('should handle events during the DST-end repeated hour', () => {
      MockDate.set('2024-11-03T08:30:00Z');

      const utcTimestamp = new Date('2024-11-03T08:30:00Z');
      const result = adjustToLosAngelesTime(utcTimestamp);

      // 08:30 UTC on Nov 3 = 1:30am PST (post-fallback). Rebuilding: 1:30am PST = 9:30am UTC.
      expect(result.toISOString()).toBe('2024-11-03T09:30:00.000Z');
    });
  });

  describe('isSameUTCDate', () => {
    it('should return true for dates on the same LA day', () => {
      const date1 = new Date('2023-11-02T19:00:00Z');
      const date2 = new Date('2023-11-02T10:00:00Z');
      expect(isSameUTCDate(date1, date2)).toBe(true);
    });

    it('should return false for dates on different LA days', () => {
      const date1 = new Date('2023-11-02T19:00:00Z');
      const date2 = new Date('2023-11-03T10:00:00Z');
      expect(isSameUTCDate(date1, date2)).toBe(false);
    });

    it('should return true when UTC days differ but LA day is the same', () => {
      const date1 = new Date('2026-02-18T03:00:00Z'); // Tue 7pm PST
      const date2 = new Date('2026-02-18T04:00:00Z'); // Tue 8pm PST
      expect(isSameUTCDate(date1, date2)).toBe(true);
    });
  });

  describe('doesEventExist', () => {
    it('should return true if an event exists on the same LA day', () => {
      const today = new Date('2023-11-02T12:00:00Z'); // Nov 2 5am PDT
      expect(doesEventExist('Event 1', today, mockEvents)).toBe(true);
    });

    it('should return false if no event exists on the same LA day', () => {
      const today = new Date('2023-11-03T12:00:00Z');
      expect(doesEventExist('Event 1', today, mockEvents)).toBe(false);
    });
  });

  describe('filterAndCreateEvents', () => {
    it('should not create events already present for today', async () => {
      MockDate.set('2023-11-02T12:00:00Z'); // Nov 2 5am PDT

      await filterAndCreateEvents(mockEvents, mockRecurringEvents, mockURL, mockHeader, fetch);

      // No POST call should have been made
      expect(fetch).not.toHaveBeenCalled();
    });

    it('should correctly create event with right UTC time before DST ends (PDT)', async () => {
      MockDate.set('2023-11-04T23:00:00Z'); // Nov 4 at 4pm PDT

      const preDstEvent = [
        {
          name: 'Pre-DST Event',
          date: '2023-11-04T08:00:00Z', // 8 AM UTC = 1 AM PDT Nov 4
          startTime: '2023-11-04T08:00:00Z',
          endTime: '2023-11-04T10:00:00Z',
          hours: 2,
        },
      ];
      await filterAndCreateEvents([], preDstEvent, mockURL, mockHeader, fetch);

      // Verify POST was called
      expect(fetch).toHaveBeenCalledWith(
        `${mockURL}/api/events/`,
        expect.objectContaining({ method: 'POST' }),
      );

      // Verify the POST body has the correct start time
      const postCall = fetch.mock.calls.find(([, opts]) => opts?.method === 'POST');
      const body = JSON.parse(postCall[1].body);
      expect(body).toHaveLength(1);
      expect(body[0].name).toBe('Pre-DST Event');
      // 1am PDT on Nov 4 = 8am UTC Nov 4
      expect(body[0].startTime).toBe('2023-11-04T08:00:00.000Z');

      MockDate.reset();
    });

    it('should correctly create event during DST ending (PDT -> PST shift)', async () => {
      MockDate.set('2023-11-05T18:00:00Z'); // Nov 5 at 10am PST (after DST ends)

      const dstTransitionEvent = [
        {
          name: 'DST Shift Event',
          date: '2023-11-05T09:00:00Z', // 9am UTC = 1am PST
          startTime: '2023-11-05T09:00:00Z',
          endTime: '2023-11-05T11:00:00Z',
          hours: 2,
        },
      ];

      await filterAndCreateEvents([], dstTransitionEvent, mockURL, mockHeader, fetch);

      const postCall = fetch.mock.calls.find(([, opts]) => opts?.method === 'POST');
      const body = JSON.parse(postCall[1].body);
      expect(body).toHaveLength(1);
      expect(body[0].name).toBe('DST Shift Event');
      // 1am PST on Nov 5 = 9am UTC
      expect(body[0].startTime).toBe('2023-11-05T09:00:00.000Z');

      MockDate.reset();
    });

    it('should correctly create event before DST starts (PST -> PDT)', async () => {
      MockDate.set('2024-03-10T09:00:00Z'); // Mar 10 at 1am PST

      const preDstStartEvent = [
        {
          name: 'Pre-DST Start Event',
          date: '2024-03-10T09:00:00Z', // 9am UTC = 1am PST
          startTime: '2024-03-10T09:00:00Z',
          endTime: '2024-03-10T11:00:00Z',
          hours: 2,
        },
      ];

      await filterAndCreateEvents([], preDstStartEvent, mockURL, mockHeader, fetch);

      const postCall = fetch.mock.calls.find(([, opts]) => opts?.method === 'POST');
      const body = JSON.parse(postCall[1].body);
      expect(body).toHaveLength(1);
      expect(body[0].name).toBe('Pre-DST Start Event');
      // 1am PST = 9am UTC
      expect(body[0].startTime).toBe('2024-03-10T09:00:00.000Z');

      MockDate.reset();
    });

    it('should correctly create event during DST start (PST -> PDT shift)', async () => {
      MockDate.set('2024-03-10T18:00:00Z'); // Mar 10 at 11am PDT

      const dstStartTransitionEvent = [
        {
          name: 'DST Start Event',
          date: '2024-03-10T10:00:00Z', // 10am UTC = 3am PDT
          startTime: '2024-03-10T10:00:00Z',
          endTime: '2024-03-10T12:00:00Z',
          hours: 2,
        },
      ];
      await filterAndCreateEvents([], dstStartTransitionEvent, mockURL, mockHeader, fetch);

      const postCall = fetch.mock.calls.find(([, opts]) => opts?.method === 'POST');
      const body = JSON.parse(postCall[1].body);
      expect(body).toHaveLength(1);
      expect(body[0].name).toBe('DST Start Event');
      // 3am PDT = 10am UTC
      expect(body[0].startTime).toBe('2024-03-10T10:00:00.000Z');

      MockDate.reset();
    });
  });

  describe('runTask', () => {
    it('should fetch data but not create events if all exist', async () => {
      MockDate.set('2023-11-02T12:00:00Z'); // Nov 2 5am PDT

      fetch.mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue(mockEvents),
      });

      fetch.mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue(mockRecurringEvents),
      });

      await runTask(fetch, mockURL, mockHeader);

      expect(fetch).toHaveBeenCalledTimes(2);

      expect(fetch).toHaveBeenCalledWith(
        `${mockURL}/api/recurringevents/`,
        expect.objectContaining({ headers: { 'x-customrequired-header': mockHeader } }),
      );

      expect(fetch).not.toHaveBeenCalledWith(
        `${mockURL}/api/events/`,
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });

  describe('createEvents', () => {
    it('should create a new event via POST request', async () => {
      const mockEvent = { name: 'Event 1', date: '2023-11-02T19:00:00Z' };
      const mockEventArray = [mockEvent];
      fetch.mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue({ id: 1, ...mockEvent }),
      });

      const result = await createEvents(mockEventArray, mockURL, mockHeader, fetch);

      expect(fetch).toHaveBeenCalledWith(`${mockURL}/api/events/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-customrequired-header': mockHeader,
        },
        body: JSON.stringify(mockEventArray),
      });
      expect(result).toEqual({ id: 1, ...mockEvent });
    });

    it('should return null if event creation fails', async () => {
      fetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await createEvents(null, mockURL, mockHeader, fetch);

      expect(result).toBeNull();
    });
  });

  describe('scheduleTask', () => {
    it('should schedule the runTask function', () => {
      const scheduleSpy = jest.spyOn(cron, 'schedule').mockImplementation((_, callback) => {
        callback();
      });

      scheduleTask(cron, fetch, mockURL, mockHeader);

      expect(scheduleSpy).toHaveBeenCalledWith('*/30 * * * *', expect.any(Function));

      scheduleSpy.mockRestore();
    });
  });
});
