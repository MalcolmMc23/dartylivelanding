import { SimpleVideoChat } from "@/components/SimpleVideoChat";
import { Suspense } from "react";

export default function SimpleVideoPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <SimpleVideoChat />
    </Suspense>
  );
}
