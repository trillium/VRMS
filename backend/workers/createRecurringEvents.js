const { generateEventData } = require('./lib/generateEventData');
const { getLAComponents, getLADayOfWeek, laWallClockToUTC, isSameLADate } = require('./lib/timezone-utils');

//API CALLS to GET and POST
/** GET
 * Utility to fetch data from an API endpoint.
 * @param {string} endpoint - The API endpoint to fetch data from.
 * @param {string} URL - The base URL for API requests.
 * @param {string} headerToSend - Custom request header.
 * @returns {Promise<Array>} - Resolves to the fetched data or an empty array on failure.
 */
const fetchData = async (endpoint, URL, headerToSend, fetch) => {
  try {
    const res = await fetch(`${URL}${endpoint}`, {
      headers: { 'x-customrequired-header': headerToSend },
    });
    if (!res?.ok) throw new Error(`Failed to fetch: ${endpoint}`);
    return await res.json();
  } catch (error) {
    console.error(`Error fetching ${endpoint}:`, error);
    return [];
  }
};

/** POST
 * Creates a new event by making a POST request to the events API.
 * @param {Object} eventArray - The events array data to create.
 * @returns {Promise<Object|null>} - The created event data or null on failure.
 */
const createEvents = async (eventArray, URL, headerToSend, fetch) => {
  if (!eventArray) return null;

  try {
    const res = await fetch(`${URL}/api/events/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-customrequired-header': headerToSend,
      },
      body: JSON.stringify(eventArray),
    });
    if (!res.ok) throw new Error('Failed to create event');
    return await res.json();
  } catch (error) {
    console.error('Error creating event:', error);
    return null;
  }
};

/**
 * Checks if two dates are on the same day in Los Angeles timezone.
 * @param {Date} eventDate - Event date.
 * @param {Date} todayDate - Today's date.
 * @returns {boolean} - True if both dates are on the same LA calendar day.
 */
const isSameUTCDate = (eventDate, todayDate) => {
  return isSameLADate(eventDate, todayDate);
};

/**
 * Checks if an event with the given name already exists for today's date.
 * @param {string} recurringEventName - The name of the recurring event to check.
 * @param {Date} today - Today's date in UTC.
 * @returns {boolean} - True if the event exists, false otherwise.
 */
const doesEventExist = (recurringEventName, today, events) =>
  events.some((event) => {
    const eventDate = new Date(event.date);
    return isSameUTCDate(eventDate, today) && event.name === recurringEventName;
  });

/**
 * Extracts the LA wall-clock time from a stored event timestamp and
 * returns the correct UTC Date for that wall-clock time on today's LA date.
 * @param {Date|string} eventDate - The stored event date (contains the intended LA time).
 * @returns {Date} - The correct UTC Date for today's occurrence of that LA time.
 */
const adjustToLosAngelesTime = (eventDate) => {
  const d = new Date(eventDate);
  // Extract the LA wall-clock hour/minute from the stored event
  const eventLA = getLAComponents(d);

  // Get today's LA date
  const todayLA = getLAComponents(new Date());

  // Combine today's LA date with the event's LA time → correct UTC
  return laWallClockToUTC(
    todayLA.year,
    todayLA.month,
    todayLA.day,
    eventLA.hour,
    eventLA.minute,
    eventLA.second,
  );
};

/**
 * Filters recurring events happening today and creates new events if they do not already exist.
 * Adjusts for Daylight Saving Time (DST) by converting stored UTC dates to Los Angeles time.
 * @param {Array} events - The list of existing events.
 * @param {Array} recurringEvents - The list of recurring events to check.
 * @param {string} URL - The base URL for API requests.
 * @param {string} headerToSend - Custom header for authentication or request tracking.
 * @param {Function} fetch - Fetch function for making API calls.
 * @returns {Promise<void>} - A promise that resolves when all events are processed.
 */
const filterAndCreateEvents = async (events, recurringEvents, URL, headerToSend, fetch) => {
  const today = new Date();
  const todayLADay = getLADayOfWeek(today);

  const eventsToCreate = recurringEvents?.filter((recurringEvent) => {
    // Get the event's day-of-week in LA timezone
    const eventLADay = getLADayOfWeek(new Date(recurringEvent.date));
    return (
      eventLADay === todayLADay &&
      !doesEventExist(recurringEvent.name, today, events)
    );
  });

  //Check if event exists
  if (!eventsToCreate || eventsToCreate?.length === 0) {
    return 'No events for today.';
  } else {
    const batchEvents = [];
    for (const event of eventsToCreate) {
      // Compute correct UTC start time for today's occurrence
      const correctedStartTime = adjustToLosAngelesTime(event.startTime);
      const timeCorrectedEvent = {
        ...event,
        date: correctedStartTime.toISOString(),
        startTime: correctedStartTime.toISOString(),
      };
      // map/generate all event data with adjusted date, startTime
      const eventToCreate = generateEventData(timeCorrectedEvent);
      batchEvents.push(eventToCreate);
    }
    const createdEvents = await createEvents(batchEvents, URL, headerToSend, fetch);
    if (createdEvents) console.log('Created events:', createdEvents);
    return "Today's events have been created.";
  }
};

/**
 * Executes the task of fetching existing events and recurring events,
 * filtering those that should occur today, and creating them if needed.
 * @param {Function} fetch - Fetch function for making API requests.
 * @param {string} URL - The base URL for API requests.
 * @param {string} headerToSend - Custom header for authentication or request tracking.
 * @returns {Promise<void>} - A promise that resolves when all tasks are completed.
 */
const runTask = async (fetch, URL, headerToSend) => {
  console.log("Creating today's events...");
  const [events, recurringEvents] = await Promise.all([
    fetchData('/api/events/', URL, headerToSend, fetch),
    fetchData('/api/recurringevents/', URL, headerToSend, fetch),
  ]);

  const checkAndCreateEvents = await filterAndCreateEvents(
    events,
    recurringEvents,
    URL,
    headerToSend,
    fetch,
  );
  console.log(checkAndCreateEvents);
};

/**
 * Schedules the runTask function to execute periodically using a cron job.
 * @param {Object} cron - The cron scheduling library.
 * @param {Function} fetch - Fetch function for making API requests.
 * @param {string} URL - The base URL for API requests.
 * @param {string} headerToSend - Custom header for authentication or request tracking.
 * @returns {Object} - The scheduled cron job instance.
 */
const scheduleTask = (cron, fetch, URL, headerToSend) => {
  return cron.schedule('*/30 * * * *', () => {
    runTask(fetch, URL, headerToSend).catch((error) => console.error('Error running task:', error));
  });
};

/**
 * Wrapper function to initialize the worker with dependencies in app.js
 * @param {Object} cron - The cron scheduling library.
 * @param {Function} fetch - Fetch function for making API requests.
 * @returns {Object} - The scheduled cron job instance.
 */
const createRecurringEvents = (cron, fetch) => {
  const URL =
    process.env.NODE_ENV === 'prod'
      ? 'https://www.vrms.io'
      : `http://localhost:${process.env.BACKEND_PORT}`;
  const headerToSend = process.env.CUSTOM_REQUEST_HEADER;

  return scheduleTask(cron, fetch, URL, headerToSend);
};

module.exports = {
  createRecurringEvents,
  fetchData,
  adjustToLosAngelesTime,
  isSameUTCDate,
  doesEventExist,
  createEvents,
  filterAndCreateEvents,
  runTask,
  scheduleTask,
};
