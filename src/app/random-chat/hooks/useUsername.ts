import { useState, useEffect } from 'react';

export const useUsername = () => {
  const [username, setUsername] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchUsername = async () => {
      try {
        const response = await fetch('/api/auth/get-username');
        console.log('Username API response:', {
          status: response.status,
          ok: response.ok
        });
        
        if (!response.ok) {
          throw new Error('Failed to fetch username');
        }
        
        const data = await response.json();
        console.log('Username API data:', data);
        
        if (data.username) {
          setUsername(data.username);
        } else {
          console.error('No username in response data:', data);
          setError('No username found in response');
        }
      } catch (err) {
        console.error('Username fetch error:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch username');
      } finally {
        setIsLoading(false);
      }
    };

    fetchUsername();
  }, []);

  return { username, error, isLoading };
}; 