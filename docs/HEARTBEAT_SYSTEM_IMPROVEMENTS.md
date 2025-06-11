# Heartbeat System Improvements and Bug Fixes

## Overview
This document outlines the problems encountered with the initial heartbeat system and the comprehensive changes implemented to enhance its robustness, responsiveness, and accuracy in managing user presence and matching queues.

## The Initial Problem: Stale Matches and Delayed Cleanup

Initially, the system relied on a single 30-second heartbeat TTL (Time To Live) to determine user activity. While simple, this approach led to significant issues:

1.  **Delayed Disconnection Detection**: When a user unexpectedly closed their tab or lost connectivity, their `heartbeat:{userId}` Redis key would persist for up to 30 seconds. During this window, the matching system could still pair an active user with the disconnected user, leading to a poor user experience for the active participant.
2.  **"Failed to find match" Error**: After implementing the two-phase heartbeat, a new issue arose where users quickly received a "Failed to find match" error. This was traced back to the `enqueue` endpoint, which was still checking for the old, single `heartbeat:{userId}` key. This caused the `enqueue` service to incorrectly mark active users (who were sending the new primary/secondary heartbeats) as stale, preventing them from being matched.

## The Solution: Two-Phase Heartbeat System with Resilient Polling

To address these challenges, a more sophisticated two-phase heartbeat system was introduced, complemented by improved client-side polling and server-side activity checks.

### Core Principles of the New System:

*   **Faster Disconnection Detection**: A shorter, more frequent heartbeat helps detect immediate disconnections.
*   **Resilience to Network Glitches**: A longer secondary heartbeat provides a safety net for temporary network interruptions.
*   **Accurate User Activity**: All relevant server-side endpoints now check for both heartbeats to ensure a user is truly active.
*   **Client-Side Recovery**: The client-side polling mechanism was made more intelligent to recover from temporary queue disconnections.

### Implemented Changes:

1.  **`dartylivelanding/src/app/api/simple-matching/heartbeat/route.ts` (API Endpoint)**
    *   **New Request Body**: The endpoint now accepts an `isPrimary` boolean flag (defaults to `true`).
    *   **Dual Heartbeat Keys**: Instead of a single `heartbeat:${userId}` key, it now sets:
        *   `heartbeat:primary:${userId}`: With a **10-second TTL** (Time To Live). This is sent frequently by the client for quick activity checks.
        *   `heartbeat:secondary:${userId}`: With a **30-second TTL**. This acts as a backup for more sustained presence.
    *   **Queue Management**: When a heartbeat is received and the user is in the `matching:waiting` queue, the endpoint now verifies *both* `heartbeat:primary` and `heartbeat:secondary` keys. If either is missing, the user is immediately removed from the queue.
    *   **`isUserActive` Helper**: A new `isUserActive` helper function was added to check the status of both heartbeat keys, making it easier for other modules to verify user activity.

2.  **`dartylivelanding/src/app/random-chat/utils/api.ts` (API Utility)**
    *   The `sendHeartbeat` function was updated to accept the `isPrimary` parameter, allowing the client to specify which heartbeat type to send.

3.  **`dartylivelanding/src/app/random-chat/hooks/useHeartbeat.ts` (Client Hook)**
    *   **Two Intervals**: This hook now manages two separate `setInterval` calls:
        *   One sends the primary heartbeat (`isPrimary: true`) every **10 seconds**.
        *   The other sends the secondary heartbeat (`isPrimary: false`) every **30 seconds**.
    *   Ensures both types of heartbeats are sent consistently from the client side.

4.  **`dartylivelanding/src/app/api/simple-matching/cleanup/route.ts` (API Endpoint)**
    *   **Dual Heartbeat Check**: The cleanup logic was updated to check for both `heartbeat:primary:${userId}` and `heartbeat:secondary:${userId}` when identifying stale users in both the `matching:waiting` and `matching:in_call` Redis sets.
    *   **Comprehensive Deletion**: When a user is deemed stale and removed, both primary and secondary heartbeat keys are deleted from Redis.

5.  **`dartylivelanding/src/app/api/simple-matching/enqueue/route.ts` (API Endpoint - Crucial Bug Fix)**
    *   **Heartbeat Verification**: This endpoint's logic for determining active users within the `matching:waiting` queue was modified.
    *   It now fetches *both* `heartbeat:primary:${waitingUser}` and `heartbeat:secondary:${waitingUser}`.
    *   A user is considered eligible for matching *only if both* primary and secondary heartbeats are active (not stale and within their respective TTLs).
    *   **Consistent Cleanup**: If a user is removed from the queue due to staleness at this stage, both primary and secondary heartbeat keys are also deleted from Redis, maintaining data consistency.

6.  **`dartylivelanding/src/app/random-chat/hooks/useMatching.ts` (Client Hook - Resilient Polling)**
    *   **Retry Logic**: The `startPolling` function was enhanced with a `notInQueueCount` to track consecutive times the client receives a `!data.inQueue` response from `checkMatch`.
    *   **Automatic Re-queuing**: Instead of immediately showing an error, if the client receives `!data.inQueue` for 3 consecutive polls (6 seconds), it now automatically attempts to `api.enqueue(userId)` again.
    *   If the re-queue is successful (either an immediate match or successfully re-enqueued), polling resumes.
    *   The "Failed to find match" error is now only displayed if the re-queue attempt also fails.

## Conclusion

These extensive modifications have significantly improved the reliability and user experience of the matching system. The two-phase heartbeat provides faster detection of disconnections while offering resilience, and the updated server-side logic along with the client-side recovery mechanism ensures that users are accurately managed within the matching queue, drastically reducing instances of stale matches and premature error messages. The system is now more robust against network fluctuations and unexpected client disconnections. 