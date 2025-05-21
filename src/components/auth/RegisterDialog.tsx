"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState } from "react";
import { toast } from "sonner";
import { signIn } from "next-auth/react"; // <-- Add this import

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onShowLogin: () => void;
  onSuccess?: () => void; // <-- Add this line
}

export function RegisterDialog({ open, onOpenChange, onShowLogin, onSuccess }: Props) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  // Helper to check for .edu email
  function isEduEmail(email: string) {
    return email.trim().toLowerCase().endsWith(".edu");
  }

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    // Client-side .edu check
    if (!isEduEmail(email)) {
      setError("You must use a .edu email address to register.");
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch(`/api/auth/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email,
          password,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        if (response.status === 409) {
          throw new Error(data.message || 'An account with this email already exists.');
        }
        throw new Error(data.message || 'Registration failed');
      }

      // Automatically log in after successful registration
      const loginResponse = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      if (loginResponse?.error) {
        throw new Error("Account created, but automatic login failed. Please try logging in.");
      }

      onOpenChange(false);
      toast.success("Account created!", {
        description: "Your account has been successfully created",
      });
      if (onSuccess) onSuccess();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "An error occurred during registration";
      setError(errorMessage);
      toast.error("Registration failed", {
        description: errorMessage,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignInClick = () => {
    onOpenChange(false);
    onShowLogin();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold text-center">Create Account</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleRegister} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="Enter your .edu email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={isLoading}
            />
            <p className="text-xs text-muted-foreground">
              You must use a <span className="font-semibold">.edu</span> email address to register.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              placeholder="Create a password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={isLoading}
            />
          </div>
          {error && (
            <p className="text-sm text-red-500 text-center">{error}</p>
          )}
          <Button 
            type="submit" 
            className="w-full hover:cursor-pointer" 
            disabled={isLoading || !email || !password}
          >
            {isLoading ? "Creating Account..." : "Create Account"}
          </Button>
          <p className="text-sm text-center text-muted-foreground">
            Already have an account?{" "}
            <button
              type="button"
              className="text-primary underline-offset-4 hover:cursor-pointer hover:underline"
              onClick={handleSignInClick}
            >
              Sign in here
            </button>
          </p>
        </form>
      </DialogContent>
    </Dialog>
  );
}
