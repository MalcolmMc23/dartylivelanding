// components/LoginPromptDialog.tsx
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
import { signIn } from "next-auth/react";
import { RegisterDialog } from "./RegisterDialog";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void; // already present
}

export function LoginDialog({ open, onOpenChange, onSuccess }: Props) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showRegister, setShowRegister] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      const response = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      if (response?.error) {
        setError("Invalid email or password");
        toast.error("Login failed", {
          description: "Invalid email or password",
        });
      } else {
        onOpenChange(false);
        toast.success("Welcome back!", {
          description: "You have successfully logged in",
        });
        if (onSuccess) onSuccess(); // <-- Call onSuccess after successful login
      }
    } catch (err) {
      setError("An error occurred. Please try again.");
      toast.error("Login failed", {
        description: "An unexpected error occurred",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegisterClick = () => {
    onOpenChange(false);
    setShowRegister(true);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold text-center">Welcome Back</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="Enter your email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={isLoading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="Enter your password"
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
              {isLoading ? "Signing in..." : "Sign In"}
            </Button>
            <p className="text-sm text-center text-muted-foreground">
              Don't have an account?{" "}
              <button
                type="button"
                className="text-primary underline-offset-4 hover:cursor-pointer hover:underline"
                onClick={handleRegisterClick}
              >
                Register here
              </button>
            </p>
          </form>
        </DialogContent>
      </Dialog>
      <RegisterDialog 
        open={showRegister} 
        onOpenChange={setShowRegister}
        onShowLogin={() => {
          setShowRegister(false);
          onOpenChange(true);
        }}
        onSuccess={onSuccess} // <-- Pass onSuccess to RegisterDialog
      />
    </>
  );
}
