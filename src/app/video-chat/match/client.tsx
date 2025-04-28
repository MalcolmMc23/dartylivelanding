"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { MatchFinder } from "@/components/MatchFinder";

export default function ClientMatchPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [username, setUsername] = useState<string | null>(null);

  useEffect(() => {
    // Get username from URL params
    const usernameParam = searchParams.get("username");

    if (!usernameParam) {
      // Redirect to video-chat if no username
      router.push("/video-chat");
      return;
    }

    setUsername(usernameParam);
  }, [searchParams, router]);

  // Show loading until we have confirmed username
  if (!username) {
    return (
      <div className="w-full h-screen flex items-center justify-center bg-black">
        <p className="text-white">Loading...</p>
      </div>
    );
  }

  return <MatchFinder username={username} />;
}
