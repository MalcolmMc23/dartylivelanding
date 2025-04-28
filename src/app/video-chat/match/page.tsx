import { Suspense } from "react";
import ClientMatchPage from "./client";

export default function MatchPage() {
  return (
    <Suspense fallback={<MatchLoading />}>
      <ClientMatchPage />
    </Suspense>
  );
}

// Loading fallback for Suspense
function MatchLoading() {
  return (
    <div className="w-full h-screen flex items-center justify-center bg-black">
      <p className="text-white">Loading match finder...</p>
    </div>
  );
}
