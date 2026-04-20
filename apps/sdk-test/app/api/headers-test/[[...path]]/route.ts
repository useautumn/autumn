import { autumnHandler } from "autumn-js/next";
import { NextResponse } from "next/server";
import { SDK_TEST_IDENTITY } from "@/lib/autumn/testIdentity";

const handler = autumnHandler({
  secretKey: process.env.AUTUMN_SECRET_KEY,
  // autumnURL: "http://localhost:8080",
  identify: async () => SDK_TEST_IDENTITY,
  pathPrefix: "/api/headers-test",
});

/**
 * Echo endpoint that returns all received headers back to the client.
 * This is used to test that custom headers from AutumnProvider are properly
 * sent to the backend handler.
 */
const echoHandler = async (request: Request) => {
  const headers: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    headers[key] = value;
  });

  let body: unknown = null;
  if (request.method !== "GET") {
    try {
      body = await request.json();
    } catch {
      body = null;
    }
  }

  return NextResponse.json({
    message: "Headers echoed back",
    code: "headers_echo",
    statusCode: 200,
    headers,
    body,
  });
};

export const GET = async (request: Request) => {
  const url = new URL(request.url);
  // If the path ends with /echo, use the echo handler
  if (url.pathname.endsWith("/echo")) {
    return echoHandler(request);
  }
  // Otherwise use the autumn handler
  return handler.GET(request);
};

export const POST = async (request: Request) => {
  const url = new URL(request.url);
  // If the path ends with /echo, use the echo handler
  if (url.pathname.endsWith("/echo")) {
    return echoHandler(request);
  }
  // Otherwise use the autumn handler
  return handler.POST(request);
};

export const DELETE = async (request: Request) => {
  const url = new URL(request.url);
  // If the path ends with /echo, use the echo handler
  if (url.pathname.endsWith("/echo")) {
    return echoHandler(request);
  }
  // Otherwise use the autumn handler
  return handler.DELETE(request);
};
