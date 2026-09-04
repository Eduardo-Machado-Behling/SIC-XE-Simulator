"use client";

import { useState } from "react";

export default function Home() {
  const [response, setResponse] = useState<string>("");

  async function testApi() {
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL;

      const res = await fetch(`${apiUrl}/api/hello`);

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const data = await res.json();

      setResponse(JSON.stringify(data, null, 2));
    } catch (error) {
      setResponse(
        `Error: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-6">
      <h1 className="text-4xl font-bold">
        SIC/XE Simulator
      </h1>

      <button
        onClick={testApi}
        className="px-6 py-3 rounded bg-blue-600 text-white"
      >
        Test C++ Backend
      </button>

      {response && (
        <pre className="p-4 bg-gray-100 rounded">
          {response}
        </pre>
      )}
    </main>
  );
}