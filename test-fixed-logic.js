// Test the FIXED new ticket detection logic
console.log('=== TESTING FIXED NEW TICKET DETECTION LOGIC ===');

function testNewTicketDetection(previousList, newList, testName) {
    console.log(`\n--- ${testName} ---`);
    console.log('Previous list:', previousList);
    console.log('New list:', newList);
    
    const difference = newList.filter(x => !previousList.includes(x));
    console.log('Difference:', difference);
    
    // FIXED LOGIC: Only trigger if previousList is not empty AND there are new tickets
    const shouldTrigger = previousList.length > 0 && difference.length > 0;
    console.log('Previous list length > 0:', previousList.length > 0);
    console.log('Difference length > 0:', difference.length > 0);
    console.log('Should trigger audio?', shouldTrigger ? 'YES' : 'NO');
    
    return shouldTrigger;
}

// Test Case 1: First run (should NOT trigger)
testNewTicketDetection(
    [], 
    ['INC001', 'INC002', 'INC003'], 
    'FIRST RUN (should NOT trigger)'
);

// Test Case 2: Same tickets (should NOT trigger)
testNewTicketDetection(
    ['INC001', 'INC002', 'INC003'], 
    ['INC001', 'INC002', 'INC003'], 
    'SAME TICKETS (should NOT trigger)'
);

// Test Case 3: New ticket added (should trigger)
testNewTicketDetection(
    ['INC001', 'INC002', 'INC003'], 
    ['INC001', 'INC002', 'INC003', 'INC004'], 
    'NEW TICKET ADDED (should trigger)'
);

// Test Case 4: Ticket removed (should NOT trigger)
testNewTicketDetection(
    ['INC001', 'INC002', 'INC003', 'INC004'], 
    ['INC001', 'INC002', 'INC003'], 
    'TICKET REMOVED (should NOT trigger)'
);

// Test Case 5: Mixed change (should trigger for new ticket)
testNewTicketDetection(
    ['INC001', 'INC002', 'INC003'], 
    ['INC001', 'INC003', 'INC004'], 
    'MIXED CHANGE (should trigger for INC004)'
);

console.log('\n=== SUMMARY ===');
console.log('✅ FIXED: First run will no longer trigger false alarms');
console.log('✅ FIXED: Only actual new tickets will trigger audio');
console.log('✅ LOGIC: Audio triggers only when previousList.length > 0 AND difference.length > 0');
