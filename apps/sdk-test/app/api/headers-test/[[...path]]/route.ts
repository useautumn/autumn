import { autumnHandler } from "autumn-js/next";
import { NextResponse } from "next/server";
import { SDK_TEST_IDENTITY } from "@/lib/autumn/testIdentity";

const handler = autumnHandler({
  secretKey: process.env.AUTUMN_SECRET_KEY,
  identify: async () => SDK_TEST_IDENTITY,
  pathPrefix: "/api/headers-test",
});

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
  if (url.pathname.endsWith("/echo")) {
    return echoHandler(request);
  }
  return handler.GET(request);
};

export const POST = async (request: Request) => {
  const url = new URL(request.url);
  if (url.pathname.endsWith("/echo")) {
    return echoHandler(request);
  }
  return handler.POST(request);
};

export const DELETE = async (request: Request) => {
  const url = new URL(request.url);
  if (url.pathname.endsWith("/echo")) {
    return echoHandler(request);
  }
  return handler.DELETE(request);
};
