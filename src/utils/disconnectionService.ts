/**
 * Disconnection Service
 * 
 * A centralized service for handling user disconnections consistently across the application.
 * This helps prevent race conditions and ensures all disconnection events are processed properly.
 */

type DisconnectionReason = 
  | 'user_left' 
  | 'user_disconnected' 
  | 'browser_closed' 
  | 'component_cleanup' 
  | 'error' 
  | 'timeout';

type DisconnectionResult = {
  success: boolean;
  status?: string;
  roomWasActive?: boolean;
  leftBehindUser?: string;
  newRoomName?: string;
  immediateMatch?: { 
    status: string;
    roomName?: string;
    matchedWith?: string;
  }; // The match object if an immediate match was found
  error?: string;
};

interface DisconnectionOptions {
  username: string;
  roomName: string;
  otherUsername?: string;
  reason: DisconnectionReason;
  router?: { push: (url: string) => void }; // Next.js router if available
  onComplete?: (result: DisconnectionResult) => void;
  redirectToNewRoom?: boolean; // Flag to indicate whether to redirect to a new room
  preventAutoMatch?: boolean; // New flag to prevent auto-matching
}

// Track if navigation is already in progress to prevent duplicate calls
let isNavigationInProgress = false;
// Track pending disconnect requests
const pendingDisconnectRequests: Array<() => Promise<DisconnectionResult>> = [];
// Track if we're currently processing a disconnect
let isProcessingDisconnect = false;

/**
 * Reset the navigation state - call this when navigation completes
 */
export function resetNavigationState() {
  isNavigationInProgress = false;
}

/**
 * Perform a disconnection, handling all server communication and navigation
 */
export async function handleDisconnection({
  username,
  roomName,
  otherUsername,
  reason,
  router,
  onComplete,
  redirectToNewRoom = false,
  preventAutoMatch = false,
}: DisconnectionOptions): Promise<DisconnectionResult> {
  // If navigation is already in progress, just return success
  if (isNavigationInProgress) {
    console.log('Navigation already in progress, skipping disconnect processing');
    return { success: true, status: 'navigation_in_progress' };
  }
  
  // Create the disconnect request function
  const disconnectRequest = async (): Promise<DisconnectionResult> => {
    console.log(`Disconnection requested for ${username} from room ${roomName}. Reason: ${reason}`);
    
    try {
      const response = await fetch('/api/user-disconnect', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username,
          roomName,
          otherUsername,
          reason,
        }),
        // Use keepalive for browser close events
        ...(reason === 'browser_closed' ? { keepalive: true } : {}),
      });

      if (!response.ok) {
        throw new Error(`Server responded with ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      console.log('Disconnect response:', data);

      // If we have a router, handle navigation
      if (router && !isNavigationInProgress) {
        isNavigationInProgress = true;
        
        // Handle different redirection scenarios
        if (redirectToNewRoom && data.newRoomName) {
          // If we have a specific room to redirect to
          router.push(`/video-chat/room/${data.newRoomName}?username=${encodeURIComponent(username)}`);
        } else if (data.status === 'immediate_match' && data.immediateMatch?.roomName) {
          // If we have an immediate match
          router.push(`/video-chat/room/${data.immediateMatch.roomName}?username=${encodeURIComponent(username)}`);
        } else {
          // Default behavior - reset to video chat with auto-match if needed
          const url = new URL('/video-chat', window.location.origin);
          url.searchParams.set('reset', 'true');
          url.searchParams.set('username', username);
          
          // Add auto-match parameter if requested AND not prevented
          if (!preventAutoMatch && (data.status === 'immediate_match' || reason === 'user_disconnected' || redirectToNewRoom)) {
            url.searchParams.set('autoMatch', 'true');
          }
          
          console.log(`Navigating to: ${url.toString()}`);
          router.push(url.toString());
        }
      }

      // Call the onComplete callback if provided
      if (onComplete) {
        onComplete({
          success: true,
          ...data,
        });
      }

      return {
        success: true,
        ...data,
      };
    } catch (error) {
      console.error('Error processing disconnection:', error);
      
      // Still navigate on error if router is available
      if (router && !isNavigationInProgress) {
        isNavigationInProgress = true;
        
        // Even on error, try to redirect to new room if that was the intent
        if (redirectToNewRoom) {
          // Generate a new room name based on timestamp since we don't have the server-generated one
          const fallbackRoomName = `error-recovery-${Date.now()}`;
          router.push(`/video-chat/room/${fallbackRoomName}?username=${encodeURIComponent(username)}&errorRecovery=true`);
        } else {
          // Default behavior - go back to the entry page
          const url = new URL('/video-chat', window.location.origin);
          url.searchParams.set('reset', 'true');
          url.searchParams.set('username', username);
          // Explicitly DO NOT add autoMatch here in the error fallback for "End Call" style disconnects
          // if preventAutoMatch was intended.
          // However, for general errors, not setting autoMatch might be unexpected if it was otherwise implied.
          // For now, we'll keep it simple: if preventAutoMatch is true, it won't add it.
          // This part of the error handling might need further thought if other scenarios also use preventAutoMatch.
          if (!preventAutoMatch && (reason === 'user_disconnected' || redirectToNewRoom )) { // Example conditions for error fallback autoMatch
             // url.searchParams.set('autoMatch', 'true'); // Decided to not add autoMatch on error fallbacks for now to keep End Call clean
          }
          router.push(url.toString());
        }
      }
      
      // Call the onComplete callback if provided
      if (onComplete) {
        onComplete({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
      
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  };
  
  // If we're already processing a disconnect, queue this one
  if (isProcessingDisconnect) {
    console.log('Already processing a disconnect, queuing this request');
    pendingDisconnectRequests.push(disconnectRequest);
    return { success: true, status: 'queued' };
  }
  
  // Process this disconnect
  isProcessingDisconnect = true;
  try {
    const result = await disconnectRequest();
    
    // Process any pending disconnects
    while (pendingDisconnectRequests.length > 0) {
      const nextRequest = pendingDisconnectRequests.shift();
      if (nextRequest) {
        try {
          await nextRequest();
        } catch (e) {
          console.error('Error processing queued disconnect:', e);
        }
      }
    }
    
    return result;
  } finally {
    isProcessingDisconnect = false;
  }
} 