import { NextResponse } from "next/server";

export async function GET() {
  const backendUrl = process.env.BACKEND_INTERNAL_URL;

  if (!backendUrl) {
    return NextResponse.json(
      { error: "BACKEND_INTERNAL_URL is not configured" },
      { status: 500 }
    );
  }

  try {
    const response = await fetch(`${backendUrl}/api/hello`, {
      method: "GET",
      cache: "no-store",
    });

    if (!response.ok) {
      return NextResponse.json(
        {
          error: "Backend returned an error",
          status: response.status,
        },
        { status: 502 }
      );
    }

    const data = await response.json();

    return NextResponse.json(data);
  } catch (error) {
    console.error("Backend request failed:", error);

    return NextResponse.json(
      { error: "Could not reach backend" },
      { status: 502 }
    );
  }
}