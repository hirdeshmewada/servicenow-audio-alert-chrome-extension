// ServiceNow Audio Alerts - State Management Module
// Centralized state management for the extension

// Global state object
const state = {
    currentNumberTickets: 0,
    currentNumberTask: 0,
    currentNumberTotal: 0,
    rootURL: null,
    newStamp: 0,
    newList: [],
    oldList: [],
    scheduledPollMinutes: null,
    scheduledPollEnabled: null,
    ticketNumberGlobal: null
};

// State management functions
export function getState() {
    return { ...state };
}

export function updateState(updates) {
    Object.assign(state, updates);
    console.log('State updated:', updates);
}

export function resetState() {
    state.oldList = [];
    state.newList = [];
    state.currentNumberTickets = 0;
    state.currentNumberTask = 0;
    state.currentNumberTotal = 0;
    state.newStamp = 0;
    state.ticketNumberGlobal = null;
    console.log('State reset to defaults');
}

export function initializeState() {
    console.log('=== INITIALIZING STATE ===');
    resetState();
}

// Specific state getters
export function getTicketCounts() {
    return {
        tickets: state.currentNumberTickets,
        tasks: state.currentNumberTask,
        total: state.currentNumberTotal
    };
}

export function getTicketLists() {
    return {
        newList: [...state.newList],
        oldList: [...state.oldList]
    };
}

export function getPollingState() {
    return {
        enabled: state.scheduledPollEnabled,
        minutes: state.scheduledPollMinutes
    };
}

export function updatePollingState(enabled, minutes) {
    state.scheduledPollEnabled = enabled;
    state.scheduledPollMinutes = minutes;
}

export function updateTicketCounts(tickets, tasks, total) {
    state.currentNumberTickets = tickets;
    state.currentNumberTask = tasks;
    state.currentNumberTotal = total;
}

export function updateTicketLists(newList, oldList = null) {
    state.newList = [...newList];
    if (oldList !== null) {
        state.oldList = [...oldList];
    }
}

export function setRootURL(url) {
    state.rootURL = url;
}

export function setTicketNumberGlobal(ticketNumber) {
    state.ticketNumberGlobal = ticketNumber;
}

export function updateNewStamp(timestamp) {
    state.newStamp = timestamp;
}

// Export state for direct access (when needed)
export default state;
