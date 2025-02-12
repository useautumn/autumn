import { NextResponse } from "next/server";
import { API_URL } from "../constants";

// Export another middleware for /api xroutes?
export const autumnMiddleware = async (req: any) => {
  if (req.method !== "POST" || req.nextUrl.pathname !== "/api/autumn") {
    return;
  }

  const data = await req.json();

  if (!data.product_id || !data.customer_id) {
    return NextResponse.json(
      {
        error: "Missing product_id or customer_id",
      },
      {
        status: 400,
      }
    );
  }

  const autumnApiKey = process.env.AUTUMN_API_KEY;

  const response = await fetch(`${API_URL}/v1/attach`, {
    method: "POST",
    body: JSON.stringify(data),
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${autumnApiKey}`,
    },
  });

  const result = await response.json();
  return NextResponse.json(result);
};
