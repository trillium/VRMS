function generateEventData(eventObj, TODAY_DATE = new Date()) {
    /**
     * Generates event data based on the provided event object and date.
     * eventObj.startTime is expected to be a correct UTC ISO string for today's occurrence.
     */
    const startTime = new Date(eventObj.startTime);
    const endTime = new Date(startTime.getTime() + (eventObj.hours || 0) * 3600000);

    const eventToCreate = {
        name: eventObj.name && eventObj.name,
        hacknight: eventObj.hacknight && eventObj.hacknight,
        eventType: eventObj.eventType && eventObj.eventType,
        description: eventObj.eventDescription && eventObj.eventDescription,
        project: eventObj.project && eventObj.project,
        date: eventObj.date && startTime,
        startTime: eventObj.startTime && startTime,
        endTime: eventObj.endTime && endTime,
        hours: eventObj.hours && eventObj.hours
    }

    if (eventObj.hasOwnProperty("location")) {
        eventToCreate.location = {
            city: eventObj.location.city ? eventObj.location.city : 'REMOTE',
            state: eventObj.location.state ? eventObj.location.state : 'REMOTE',
            country: eventObj.location.country ? eventObj.location.country : 'REMOTE'
        };
    }

    return eventToCreate
};

module.exports = { generateEventData };
