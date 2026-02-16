import { autumnHandler } from "autumn-js/next";
import { logServerDebug, summarizeBody } from "@/lib/autumn/debug";
import { SDK_TEST_IDENTITY } from "@/lib/autumn/testIdentity";

const handler = autumnHandler({
  secretKey: process.env.AUTUMN_SECRET_KEY,
  baseURL: "http://localhost:8080",
  identify: async (request: Request) => {
    logServerDebug({
      label: "identify",
      payload: {
        method: request.method,
        url: request.url,
        resolvedCustomerId: SDK_TEST_IDENTITY.customerId,
        resolvedCustomerData: SDK_TEST_IDENTITY.customerData,
      },
    });

    return SDK_TEST_IDENTITY;
  },
});

const logRequest = async ({ request }: { request: Request }) => {
  let body: unknown = null;

  if (request.method !== "GET") {
    try {
      body = await request.clone().json();
    } catch {
      body = null;
    }
  }

  logServerDebug({
    label: "incoming-request",
    payload: {
      method: request.method,
      url: request.url,
      bodySummary: summarizeBody({ body }),
    },
  });
};

export async function GET(request: Request) {
  await logRequest({ request });
  return handler.GET(request);
}

export async function POST(request: Request) {
  await logRequest({ request });
  return handler.POST(request);
}
