'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { signIn } from 'next-auth/react';

function VerifyEmailContent() {
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('');
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  useEffect(() => {
    const verifyEmail = async () => {
      if (!token) {
        setStatus('error');
        setMessage('Invalid verification link');
        return;
      }

      try {
        const response = await fetch('/api/auth/verify-email', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ token }),
        });

        const data = await response.json();

        if (response.ok) {
          setStatus('success');
          setMessage('Email verified successfully! You can now use DormParty.');
          
          // Automatically sign in the user
          await signIn('credentials', {
            email: data.email,
            redirect: false,
          });
          
          // Redirect to home after 2 seconds
          setTimeout(() => {
            router.push('/');
          }, 2000);
        } else {
          setStatus('error');
          setMessage(data.message || 'Verification failed');
        }
      } catch (error) {
        setStatus('error');
        setMessage('An error occurred during verification');
      }
    };

    verifyEmail();
  }, [token, router]);

  return (
    <div className="min-h-screen bg-[#121212] flex items-center justify-center p-4">
      <div className="w-full max-w-md p-8 bg-[#1A1A1A] rounded-2xl shadow-2xl border border-[#2A2A2A]">
        <h1 className="text-2xl font-bold text-white text-center mb-6">
          Email Verification
        </h1>
        
        <div className="text-center">
          {status === 'loading' && (
            <div className="text-gray-300">
              Verifying your email...
            </div>
          )}
          
          {status === 'success' && (
            <div className="text-green-400">
              {message}
            </div>
          )}
          
          {status === 'error' && (
            <div className="text-red-400">
              {message}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function VerifyEmail() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#121212] flex items-center justify-center p-4">
        <div className="w-full max-w-md p-8 bg-[#1A1A1A] rounded-2xl shadow-2xl border border-[#2A2A2A]">
          <div className="text-center text-gray-300">
            Loading...
          </div>
        </div>
      </div>
    }>
      <VerifyEmailContent />
    </Suspense>
  );
} 