# Heartbeat Endpoint Documentation

## Overview
The heartbeat endpoint is a crucial component of the real-time matching system that maintains user presence and queue management. This endpoint is responsible for tracking active users and ensuring the matching queue remains current and efficient.

## Endpoint Details
- **Path**: `/api/simple-matching/heartbeat`
- **Method**: POST
- **Content-Type**: application/json

## Request Format
```json
{
  "userId": "string" // Required: Unique identifier for the user
}
```

## Response Format
### Success Response
```json
{
  "success": true
}
```

### Error Responses
```json
{
  "success": false,
  "error": "User ID required"
}
```
Status: 400 Bad Request

```json
{
  "success": false,
  "error": "Internal server error"
}
```
Status: 500 Internal Server Error

## Implementation Details

### Redis Data Structure
The endpoint utilizes Redis for state management with the following key patterns:

1. **Heartbeat Tracking**
   - Key: `heartbeat:${userId}`
   - Value: Current timestamp
   - TTL: 30 seconds
   - Purpose: Tracks user activity and automatically removes inactive users

2. **Matching Queue**
   - Key: `matching:waiting`
   - Type: Sorted Set
   - Score: User's position in queue
   - Purpose: Maintains ordered list of users waiting to be matched

### Process Flow
1. **Request Validation**
   - Validates the presence of userId in the request body
   - Returns 400 error if userId is missing

2. **Heartbeat Update**
   - Updates the user's heartbeat timestamp
   - Sets a 30-second TTL to automatically remove inactive users

3. **Queue Management**
   - Checks if the user is currently in the matching queue
   - If present, updates their position while maintaining their original queue position
   - This ensures users don't lose their place in line while staying active

## Error Handling
The endpoint implements comprehensive error handling:
- Input validation errors (400)
- Internal server errors (500)
- All errors are logged for debugging purposes

## Use Cases
1. **User Presence Tracking**
   - Determine which users are currently active in the system
   - Clean up inactive users automatically

2. **Queue Management**
   - Maintain user positions in the matching queue
   - Ensure fair matching by preserving queue order

## Best Practices
- The 30-second TTL provides a good balance between responsiveness and system load
- The queue position preservation ensures fair matching
- Error handling ensures system stability and debugging capability

## Dependencies
- Next.js API Routes
- Redis for state management
- NextResponse for HTTP responses

## Security Considerations
- Input validation prevents malformed requests
- Error messages are generic to prevent information leakage
- Redis operations are wrapped in try-catch blocks

## Performance Considerations
- Redis operations are optimized for speed
- TTL-based cleanup reduces manual maintenance
- Queue operations are atomic and efficient 