// Debug script to identify the new ticket detection issue
console.log('=== DEBUGGING NEW TICKET DETECTION ISSUE ===');

// This simulates what should happen in background.js
function simulatePolling() {
    console.log('\n--- SIMULATING POLLING CYCLE ---');
    
    // Initial state (first poll)
    console.log('\n1. FIRST POLL (should not trigger new ticket alert):');
    let state = {
        oldList: [],
        newList: []
    };
    
    // Simulate fetching existing tickets
    const fetchedTickets = ['INC001', 'INC002', 'INC003'];
    state.newList = [...fetchedTickets];
    
    const previousList = [...state.oldList];
    const difference = state.newList.filter(x => !previousList.includes(x));
    
    console.log('Previous list:', previousList);
    console.log('New list:', state.newList);
    console.log('Difference:', difference);
    console.log('Should trigger audio?', difference.length > 0 ? 'YES' : 'NO');
    console.log('Actual behavior: This should NOT trigger audio on first run');
    
    // Update for next poll
    state.oldList = [...state.newList];
    console.log('Updated oldList for next poll:', state.oldList);
    
    // Second poll with same tickets (should not trigger)
    console.log('\n2. SECOND POLL (same tickets - should not trigger):');
    const sameTickets = ['INC001', 'INC002', 'INC003'];
    state.newList = [...sameTickets];
    
    const previousList2 = [...state.oldList];
    const difference2 = state.newList.filter(x => !previousList2.includes(x));
    
    console.log('Previous list:', previousList2);
    console.log('New list:', state.newList);
    console.log('Difference:', difference2);
    console.log('Should trigger audio?', difference2.length > 0 ? 'YES' : 'NO');
    console.log('Actual behavior: This should NOT trigger audio');
    
    // Update for next poll
    state.oldList = [...state.newList];
    
    // Third poll with new ticket (should trigger)
    console.log('\n3. THIRD POLL (new ticket added - should trigger):');
    const ticketsWithNew = ['INC001', 'INC002', 'INC003', 'INC004'];
    state.newList = [...ticketsWithNew];
    
    const previousList3 = [...state.oldList];
    const difference3 = state.newList.filter(x => !previousList3.includes(x));
    
    console.log('Previous list:', previousList3);
    console.log('New list:', state.newList);
    console.log('Difference:', difference3);
    console.log('Should trigger audio?', difference3.length > 0 ? 'YES' : 'NO');
    console.log('Actual behavior: This SHOULD trigger audio for INC004');
    
    console.log('\n=== POSSIBLE ISSUES TO CHECK ===');
    console.log('1. Is state.oldList being reset somewhere?');
    console.log('2. Are there multiple polling instances running?');
    console.log('3. Is the alarm condition properly set to "alarmOnNewEntry"?');
    console.log('4. Are the ticket numbers consistent between polls?');
    console.log('5. Is there a race condition in list updates?');
}

simulatePolling();

console.log('\n=== RECOMMENDED DEBUGGING STEPS ===');
console.log('1. Check browser console for "=== NEW TICKET DETECTION LOGIC ===" messages');
console.log('2. Verify "Previous list" and "New list" values in each poll');
console.log('3. Check if "Difference" array shows actual new tickets');
console.log('4. Confirm alarm condition is "alarmOnNewEntry" in storage');
console.log('5. Look for any error messages that might reset state');
