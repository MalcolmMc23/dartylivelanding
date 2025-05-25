#!/usr/bin/env node

/**
 * Production startup script for the matching system
 * Run this after deployment to ensure everything is working correctly
 */

const https = require('https');
const http = require('http');

// Configuration
const config = {
    baseUrl: process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000',
    timeout: 10000,
    retryCount: 3,
    retryDelay: 2000
};

console.log('🚀 Starting production matching system health check...');
console.log(`📍 Base URL: ${config.baseUrl}`);

async function makeRequest(url, options = {}) {
    return new Promise((resolve, reject) => {
        const client = url.startsWith('https') ? https : http;
        const timeout = setTimeout(() => {
            reject(new Error('Request timeout'));
        }, config.timeout);

        const req = client.request(url, options, (res) => {
            clearTimeout(timeout);
            let data = '';

            res.on('data', chunk => {
                data += chunk;
            });

            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    resolve({ status: res.statusCode, data: json });
                } catch (e) {
                    resolve({ status: res.statusCode, data: data });
                }
            });
        });

        req.on('error', (err) => {
            clearTimeout(timeout);
            reject(err);
        });

        if (options.body) {
            req.write(options.body);
        }

        req.end();
    });
}

async function checkHealth() {
    console.log('\n🔍 Checking system health...');

    try {
        const response = await makeRequest(`${config.baseUrl}/api/production-health?action=status&detailed=true`);

        if (response.status !== 200) {
            throw new Error(`Health check failed with status ${response.status}`);
        }

        const health = response.data;

        console.log('📊 System Status:');
        console.log(`   Redis: ${health.redis ? '✅ Connected' : '❌ Disconnected'}`);
        console.log(`   Queue Processor: ${health.queueProcessor ? '✅ Running' : '❌ Stopped'}`);
        console.log(`   Lock Status: ${health.lockStatus}`);
        console.log(`   Queue Count: ${health.queueCount}`);
        console.log(`   Active Matches: ${health.activeMatches}`);

        if (health.errors && health.errors.length > 0) {
            console.log('\n❌ Errors found:');
            health.errors.forEach(error => console.log(`   • ${error}`));
        }

        if (health.recommendations && health.recommendations.length > 0) {
            console.log('\n💡 Recommendations:');
            health.recommendations.forEach(rec => console.log(`   • ${rec}`));
        }

        return health;

    } catch (error) {
        console.error('❌ Health check failed:', error.message);
        throw error;
    }
}

async function performAutoRepair() {
    console.log('\n🔧 Performing auto-repair...');

    try {
        const response = await makeRequest(`${config.baseUrl}/api/production-health?action=repair`);

        if (response.status !== 200) {
            throw new Error(`Auto-repair failed with status ${response.status}`);
        }

        const result = response.data;

        if (result.repairs && result.repairs.length > 0) {
            console.log('✅ Auto-repairs completed:');
            result.repairs.forEach(repair => console.log(`   • ${repair}`));
        } else {
            console.log('✅ No repairs needed');
        }

        return result;

    } catch (error) {
        console.error('❌ Auto-repair failed:', error.message);
        throw error;
    }
}

async function triggerQueueProcessing() {
    console.log('\n⚡ Triggering queue processing...');

    try {
        const response = await makeRequest(`${config.baseUrl}/api/trigger-queue-processing`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        if (response.status !== 200) {
            throw new Error(`Queue processing trigger failed with status ${response.status}`);
        }

        const result = response.data;
        console.log(`✅ Queue processing completed: ${result.message}`);

        return result;

    } catch (error) {
        console.error('❌ Queue processing trigger failed:', error.message);
        throw error;
    }
}

async function runStartupSequence() {
    let attempt = 0;

    while (attempt < config.retryCount) {
        try {
            console.log(`\n🔄 Startup attempt ${attempt + 1}/${config.retryCount}`);

            // Step 1: Check initial health
            const initialHealth = await checkHealth();

            // Step 2: Perform auto-repair if needed
            if (initialHealth.errors && initialHealth.errors.length > 0) {
                await performAutoRepair();
            }

            // Step 3: Trigger queue processing
            await triggerQueueProcessing();

            // Step 4: Final health check
            console.log('\n🔍 Final health check...');
            const finalHealth = await checkHealth();

            // Check if system is healthy
            const isHealthy = finalHealth.redis && finalHealth.queueProcessor &&
                (!finalHealth.errors || finalHealth.errors.length === 0);

            if (isHealthy) {
                console.log('\n🎉 Production matching system is healthy and ready!');
                console.log('🌐 Debug panel available at: /api/production-health');
                console.log('🔧 Manual controls available in the UI debug panel (bottom-right corner)');
                return true;
            } else {
                throw new Error('System not healthy after startup sequence');
            }

        } catch (error) {
            attempt++;
            console.error(`❌ Startup attempt ${attempt} failed:`, error.message);

            if (attempt < config.retryCount) {
                console.log(`⏳ Retrying in ${config.retryDelay / 1000} seconds...`);
                await new Promise(resolve => setTimeout(resolve, config.retryDelay));
            }
        }
    }

    console.error('❌ Production startup failed after all retry attempts');
    console.log('\n🆘 Manual intervention required:');
    console.log('1. Check Redis connection and credentials');
    console.log('2. Verify environment variables are set correctly');
    console.log('3. Check server logs for detailed error messages');
    console.log('4. Try accessing /api/production-health directly');

    return false;
}

// Run the startup sequence
runStartupSequence()
    .then(success => {
        process.exit(success ? 0 : 1);
    })
    .catch(error => {
        console.error('❌ Fatal error during startup:', error);
        process.exit(1);
    }); 