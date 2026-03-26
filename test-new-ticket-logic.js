// Test "New ticket appears" logic and poll interval synchronization
console.log('=== TESTING NEW TICKET LOGIC & POLL SYNC ===');

// Simulate the background.js state and logic
const state = {
    newList: [],
    oldList: [],
    currentNumberTickets: 0,
    currentNumberTask: 0,
    currentNumberTotal: 0
};

// Test Case 1: New ticket appears
console.log('\n--- TEST CASE 1: NEW TICKET APPEARS ---');
state.oldList = ['INC001', 'INC002', 'INC003'];
state.newList = ['INC001', 'INC002', 'INC003', 'INC004']; // INC004 is new

const previousList = [...state.oldList];
console.log('Previous list:', previousList);
console.log('New list:', state.newList);

const difference = state.newList.filter(x => !previousList.includes(x));
console.log('Difference (new tickets):', difference);

if (difference.length > 0) {
    console.log('✅ SUCCESS: New ticket detected - should trigger audio');
    console.log('New tickets:', difference);
} else {
    console.log('❌ FAILED: No new tickets detected');
}

// Test Case 2: No new tickets
console.log('\n--- TEST CASE 2: NO NEW TICKETS ---');
state.oldList = ['INC001', 'INC002', 'INC003'];
state.newList = ['INC001', 'INC002', 'INC003']; // Same tickets

const previousList2 = [...state.oldList];
const difference2 = state.newList.filter(x => !previousList2.includes(x));
console.log('Previous list:', previousList2);
console.log('New list:', state.newList);
console.log('Difference (new tickets):', difference2);

if (difference2.length > 0) {
    console.log('❌ FAILED: Should not trigger audio');
} else {
    console.log('✅ SUCCESS: No new tickets - should not trigger audio');
}

// Test Case 3: Ticket removed
console.log('\n--- TEST CASE 3: TICKET REMOVED ---');
state.oldList = ['INC001', 'INC002', 'INC003', 'INC004'];
state.newList = ['INC001', 'INC002', 'INC003']; // INC004 removed

const previousList3 = [...state.oldList];
const difference3 = state.newList.filter(x => !previousList3.includes(x));
console.log('Previous list:', previousList3);
console.log('New list:', state.newList);
console.log('Difference (new tickets):', difference3);

if (difference3.length > 0) {
    console.log('❌ FAILED: Should not trigger audio for removed tickets');
} else {
    console.log('✅ SUCCESS: No new tickets - should not trigger audio');
}

// Test Poll Interval Synchronization Logic
console.log('\n=== TESTING POLL INTERVAL SYNC ===');

// Simulate poll interval change
const parsePollIntervalMinutes = (rawValue) => {
    const minutes = parseInt(rawValue, 10);
    return (isNaN(minutes) || minutes < 1) ? 5 : minutes;
};

const scheduleAlarmFromItems = (items) => {
    const pollEnabled = items.disablePoll !== "on";
    const minutes = parsePollIntervalMinutes(items.pollInterval);
    
    console.log('Scheduling alarm - pollEnabled:', pollEnabled, 'minutes:', minutes);
    
    // Simulate state comparison
    const currentState = { scheduledPollEnabled: true, scheduledPollMinutes: 5 };
    console.log('Current state - scheduledPollEnabled:', currentState.scheduledPollEnabled, 'scheduledPollMinutes:', currentState.scheduledPollMinutes);
    
    // Check if force update needed
    const forceUpdate = currentState.scheduledPollEnabled !== pollEnabled || currentState.scheduledPollMinutes !== minutes;
    
    if (!forceUpdate) {
        console.log('❌ FAILED: Should force update when interval changes');
        return false;
    } else {
        console.log('✅ SUCCESS: Force update detected');
        return true;
    }
};

// Test poll interval changes
console.log('\n--- TEST: POLL INTERVAL CHANGES ---');

// Test 1: Same interval (should not update)
const result1 = scheduleAlarmFromItems({ disablePoll: "off", pollInterval: "5" });
console.log('Same interval test:', result1);

// Test 2: Different interval (should update)
const result2 = scheduleAlarmFromItems({ disablePoll: "off", pollInterval: "10" });
console.log('Different interval test:', result2);

// Test 3: Enable/disable polling (should update)
const result3 = scheduleAlarmFromItems({ disablePoll: "on", pollInterval: "5" });
console.log('Disable polling test:', result3);

console.log('\n=== TEST COMPLETE ===');
