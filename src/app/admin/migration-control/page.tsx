"use client";

import { MigrationController } from "@/components/MigrationController";

export default function MigrationControlPage() {
  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            🔄 Queue System Migration
          </h1>
          <p className="text-lg text-gray-600">
            Advanced migration controls and monitoring dashboard
          </p>
        </div>

        <MigrationController />

        <div className="mt-8 text-center">
          <p className="text-sm text-gray-500">
            🔒 Admin access required • Last updated:{" "}
            {new Date().toLocaleString()}
          </p>
        </div>
      </div>
    </div>
  );
}
