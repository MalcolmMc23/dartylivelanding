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
    } catch {
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
        <DialogContent className="sm:max-w-[425px] bg-[#1A1A1A] border border-[#2A2A2A] text-white rounded-2xl shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold text-center text-white">Welcome Back</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-gray-300">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="Enter your email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={isLoading}
                className="bg-[#2A2A2A] border border-[#3A3A3A] text-white focus:ring-[#A855F7] focus:border-[#A855F7] rounded-xl"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="text-gray-300">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={isLoading}
                className="bg-[#2A2A2A] border border-[#3A3A3A] text-white focus:ring-[#A855F7] focus:border-[#A855F7] rounded-xl"
              />
            </div>
            {error && (
              <p className="text-sm text-[#ff3b3b] text-center">{error}</p>
            )}
            <Button 
              type="submit" 
              className="w-full bg-[#A855F7] text-white font-semibold rounded-xl hover:bg-[#9333EA] transition-all duration-200 shadow-lg shadow-[#A855F7]/20 hover:cursor-pointer" 
              disabled={isLoading || !email || !password}
            >
              {isLoading ? "Signing in..." : "Sign In"}
            </Button>
            <p className="text-sm text-center text-gray-400">
              Don&apos;t have an account?{" "}
              <button
                type="button"
                className="text-[#A855F7] underline-offset-4 hover:underline hover:cursor-pointer"
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