"use client";

import { useState } from "react";
import { SimpleMatchingInterface } from "@/components/SimpleMatchingInterface";

export default function SimpleChatPage() {
  const [username, setUsername] = useState("");

  return (
    <SimpleMatchingInterface
      initialUsername={username}
      onUsernameChange={setUsername}
    />
  );
}
