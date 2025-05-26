// Test script to verify unified match status checking
const fetch = require('node-fetch');

async function testUnifiedMatching() {
    const baseUrl = 'http://localhost:3000';

    console.log('Testing unified match status checking...');

    // Test 1: Add first user to queue
    console.log('\n1. Adding user1 to queue...');
    const response1 = await fetch(`${baseUrl}/api/match-user`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            username: 'testuser1',
            useDemo: false
        })
    });
    const result1 = await response1.json();
    console.log('User1 result:', result1);

    // Test 2: Check user1 status using new unified endpoint
    console.log('\n2. Checking user1 status with unified endpoint...');
    const statusResponse1 = await fetch(`${baseUrl}/api/check-user-match-status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'testuser1' })
    });
    const statusResult1 = await statusResponse1.json();
    console.log('User1 unified status:', statusResult1);

    // Test 3: Add second user to queue (should create a match)
    console.log('\n3. Adding user2 to queue...');
    const response2 = await fetch(`${baseUrl}/api/match-user`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            username: 'testuser2',
            useDemo: false
        })
    });
    const result2 = await response2.json();
    console.log('User2 result:', result2);

    // Wait a moment for queue processor to create match
    console.log('\n4. Waiting 3 seconds for queue processor...');
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Test 4: Check both users' status using unified endpoint
    console.log('\n5. Checking user1 status after potential match...');
    const statusResponse1After = await fetch(`${baseUrl}/api/check-user-match-status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'testuser1' })
    });
    const statusResult1After = await statusResponse1After.json();
    console.log('User1 unified status after match:', statusResult1After);

    console.log('\n6. Checking user2 status after potential match...');
    const statusResponse2After = await fetch(`${baseUrl}/api/check-user-match-status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'testuser2' })
    });
    const statusResult2After = await statusResponse2After.json();
    console.log('User2 unified status after match:', statusResult2After);

    // Test 5: Verify both users show the same match
    if (statusResult1After.status === 'matched' && statusResult2After.status === 'matched') {
        if (statusResult1After.roomName === statusResult2After.roomName) {
            console.log('\n✅ SUCCESS: Both users are matched in the same room!');
            console.log(`Room: ${statusResult1After.roomName}`);
            console.log(`User1 matched with: ${statusResult1After.matchedWith}`);
            console.log(`User2 matched with: ${statusResult2After.matchedWith}`);
        } else {
            console.log('\n❌ ERROR: Users are matched but in different rooms!');
        }
    } else {
        console.log('\n❌ ERROR: Users are not both matched!');
        console.log(`User1 status: ${statusResult1After.status}`);
        console.log(`User2 status: ${statusResult2After.status}`);
    }

    // Test 6: Test with non-existent user
    console.log('\n7. Testing with non-existent user...');
    const nonExistentResponse = await fetch(`${baseUrl}/api/check-user-match-status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'nonexistentuser' })
    });
    const nonExistentResult = await nonExistentResponse.json();
    console.log('Non-existent user status:', nonExistentResult);

    console.log('\n✅ Unified match status testing complete!');
}

testUnifiedMatching().catch(console.error); 