# Production Matching System Troubleshooting Guide

## Quick Diagnosis

When users report matching issues in production, follow these steps:

### 1. 🔧 Debug Panel (Fastest)

1. Open your deployed site
2. Look for the **🔧 Debug** button in the bottom-right corner
3. Click it to open the Production Debug Panel
4. Click **🔄 Refresh** to see current system status
5. If you see red ❌ indicators, click **🔧 Auto-Repair**

### 2. 🌐 API Health Check

Visit: `https://your-domain.com/api/production-health`

Healthy response should show:

```json
{
  "redis": true,
  "queueProcessor": true,
  "lockStatus": "free",
  "queueCount": 0,
  "activeMatches": 0,
  "errors": [],
  "recommendations": []
}
```

### 3. 🚨 Emergency Actions

If the debug panel shows critical issues:

1. **Emergency Restart**: Click the 🚨 Emergency Restart button
2. **Manual API Call**:
   ```bash
   curl -X POST https://your-domain.com/api/production-health \
     -H "Content-Type: application/json" \
     -d '{"action": "emergency-restart"}'
   ```

## Common Issues & Fixes

### Issue: Queue Processor Not Running ❌

**Symptoms**: Users waiting indefinitely, no matches being created

**Quick Fix**:

1. Use debug panel → **🔧 Auto-Repair**
2. Or API call: `GET /api/production-health?action=repair`

**Manual Fix**:

```bash
curl -X POST /api/trigger-queue-processing
```

### Issue: Redis Connection Problems ❌

**Symptoms**: All functionality broken, 500 errors

**Check**:

1. Verify `REDIS_URL` environment variable is set
2. Test Redis connectivity: `redis-cli ping` (if accessible)

**Fix**:

1. Restart your application/container
2. Check Redis service status on your hosting provider
3. Verify Redis credentials haven't expired

### Issue: Stale Locks 🔒

**Symptoms**: Matching works sporadically, some users get stuck

**Quick Fix**:

```bash
curl -X GET /api/production-health?action=clear-locks
```

### Issue: Large Queue Backlog 📊

**Symptoms**: Queue count > 50, slow matching

**Fix**:

```bash
# Clear stuck users and restart system
curl -X POST /api/production-health -H "Content-Type: application/json" \
  -d '{"action": "emergency-restart"}'
```

## Deployment Health Check

After each deployment, run:

```bash
pnpm production-health
```

This will:

- ✅ Check Redis connection
- ✅ Verify queue processor is running
- ✅ Clear any stale locks
- ✅ Trigger initial queue processing

## Environment Variables Checklist

Ensure these are set in production:

```env
# Required for Redis functionality
REDIS_URL=redis://your-redis-url

# Required for LiveKit video
LIVEKIT_API_KEY=your-key
LIVEKIT_API_SECRET=your-secret
NEXT_PUBLIC_LIVEKIT_URL=wss://your-livekit-url

# Optional: Site URL for health checks
NEXT_PUBLIC_SITE_URL=https://your-domain.com
```

## Monitoring Commands

### Check System Status

```bash
curl -s "https://your-domain.com/api/production-health?action=status&detailed=true" | jq
```

### Trigger Queue Processing

```bash
curl -X POST "https://your-domain.com/api/trigger-queue-processing"
```

### Get Queue Details

```bash
curl -s "https://your-domain.com/api/production-health?action=status&detailed=true" | jq '.queueDetails'
```

## Production Logs to Check

Look for these log messages:

### ✅ Healthy System

```
Redis connected successfully
Hybrid matching service: Background queue processor started successfully
Production health monitoring initialized
Queue processor: Successfully matched X with Y
```

### ❌ Problem Indicators

```
Redis connection error:
Queue processor: Could not acquire lock
Failed to start queue processor
Queue processor interval error:
```

## Escalation Steps

If auto-repair doesn't work:

1. **Restart Application**: Restart your Next.js app/container
2. **Check Redis**: Verify Redis service is running and accessible
3. **Clear Redis Data**:
   ```bash
   # ⚠️ Nuclear option - clears all matching data
   curl -X POST /api/reset-matching -H "Content-Type: application/json" \
     -d '{"apiKey": "your-admin-key"}'
   ```
4. **Check Logs**: Review application logs for Redis connection errors

## Performance Optimization

### For High Traffic

If you have many concurrent users:

1. **Increase Processing Frequency**: Edit `PROCESSOR_INTERVAL` in `queueProcessor.ts`
2. **Monitor Queue Size**: Keep queue count < 20 for optimal performance
3. **Scale Redis**: Use Redis cluster or higher memory instance
4. **Add Health Monitoring**: Set up alerts for queue processor status

### Redis Configuration

For production Redis:

```
# Increase connection pool
maxRetriesPerRequest: 3
connectTimeout: 10000
commandTimeout: 5000
```

## Need Help?

1. **Debug Panel**: Available 24/7 in your app (bottom-right corner)
2. **Health API**: `/api/production-health` for programmatic checks
3. **Logs**: Check your hosting provider's logs for detailed errors

The system is designed to auto-recover from most issues, but manual intervention may be needed for Redis connectivity problems or environment misconfigurations.
