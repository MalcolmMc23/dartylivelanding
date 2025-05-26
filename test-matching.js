// Test script to verify matching logic
const fetch = require('node-fetch');

async function testMatching() {
    const baseUrl = 'http://localhost:3000';

    console.log('Testing matching logic...');

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

    // Test 2: Add second user to queue (should match)
    console.log('\n2. Adding user2 to queue...');
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

    // Test 3: Check match status for both users
    console.log('\n3. Checking match status for user1...');
    const checkResponse1 = await fetch(`${baseUrl}/api/check-match`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'testuser1' })
    });
    const checkResult1 = await checkResponse1.json();
    console.log('User1 match status:', checkResult1);

    console.log('\n4. Checking match status for user2...');
    const checkResponse2 = await fetch(`${baseUrl}/api/check-match`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'testuser2' })
    });
    const checkResult2 = await checkResponse2.json();
    console.log('User2 match status:', checkResult2);

    // Test 4: Check queue state
    console.log('\n5. Checking queue state...');
    const queueResponse = await fetch(`${baseUrl}/api/check-match`);
    const queueState = await queueResponse.json();
    console.log('Queue state:', JSON.stringify(queueState, null, 2));
}

testMatching().catch(console.error); 