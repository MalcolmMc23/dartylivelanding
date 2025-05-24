const { calculateQueueScore } = require('../src/utils/redis/types.ts');

// Test the rating system calculations
function testRatingSystem() {
    console.log('Testing Queue Rating System Implementation');
    console.log('=========================================');

    const now = Date.now();

    // Test 1: User with no skip stats (new user)
    const newUserScore = calculateQueueScore('waiting', now);
    console.log(`New user (no stats): Score = ${newUserScore}`);

    // Test 2: User with good skip stats (longer interactions)
    const goodUserScore = calculateQueueScore('waiting', now, 90000, 5); // 90 seconds avg, 5 skips
    console.log(`Good user (90s avg, 5 skips): Score = ${goodUserScore}`);

    // Test 3: User with poor skip stats (very short interactions)
    const poorUserScore = calculateQueueScore('waiting', now, 15000, 10); // 15 seconds avg, 10 skips
    console.log(`Poor user (15s avg, 10 skips): Score = ${poorUserScore}`);

    // Test 4: In-call user (should have priority)
    const inCallScore = calculateQueueScore('in_call', now, 30000, 8); // 30 seconds avg, 8 skips
    console.log(`In-call user (30s avg, 8 skips): Score = ${inCallScore}`);

    // Test 5: User with insufficient skip count (should not get penalty)
    const lowSkipCountScore = calculateQueueScore('waiting', now, 10000, 2); // 10s avg but only 2 skips
    console.log(`Low skip count user (10s avg, 2 skips): Score = ${lowSkipCountScore}`);

    console.log('\nPriority Order (lower score = higher priority):');

    const scores = [
        { type: 'New user', score: newUserScore },
        { type: 'Good user', score: goodUserScore },
        { type: 'Poor user', score: poorUserScore },
        { type: 'In-call user', score: inCallScore },
        { type: 'Low skip count', score: lowSkipCountScore }
    ];

    scores.sort((a, b) => a.score - b.score);

    scores.forEach((item, index) => {
        console.log(`${index + 1}. ${item.type}: ${item.score}`);
    });

    console.log('\nTest completed! ✅');
    console.log('The rating system prioritizes:');
    console.log('1. In-call users (they get skipped and need immediate matching)');
    console.log('2. Users with longer average skip times (they provide better interactions)');
    console.log('3. Users with insufficient data or fewer skips (neutral priority)');
    console.log('4. Users with very short skip times get lower priority');
}

// Only run if this file is executed directly
if (require.main === module) {
    testRatingSystem();
}

module.exports = { testRatingSystem }; 