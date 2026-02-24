import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));

    const result = await auth.api.getOrCreateCustomer({
      headers: request.headers,
      body,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("Failed to get/create customer:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
