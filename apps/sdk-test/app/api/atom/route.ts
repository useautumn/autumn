import { Autumn, HTTPClient } from "autumn-js";
import type {
  AtomAttempt,
  AtomCall,
  AtomCallRequest,
  AtomCallResult,
} from "@/lib/atom/types";

const FORWARDED_HEADER = "x-atom-forwarded";

const parseBody = (text: string): unknown => {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
};

const recordingHTTPClient = ({
  edgeURL,
  attempts,
}: {
  edgeURL: string | undefined;
  attempts: Array<AtomAttempt>;
}) =>
  new HTTPClient({
    fetcher: async (input, init) => {
      const request = new Request(input, init);
      const edgeBase = edgeURL?.replace(/\/+$/, "");
      const target =
        edgeBase && request.url.startsWith(edgeBase) ? "edge" : "api";
      const requestBody = parseBody(await request.clone().text());
      const start = performance.now();
      try {
        const response = await fetch(request);
        attempts.push({
          target,
          method: request.method,
          url: request.url,
          status: response.status,
          ms: performance.now() - start,
          forwarded: response.headers.has(FORWARDED_HEADER),
          requestBody,
          responseBody: parseBody(await response.clone().text()),
        });
        return response;
      } catch (error) {
        attempts.push({
          target,
          method: request.method,
          url: request.url,
          status: null,
          ms: performance.now() - start,
          forwarded: false,
          requestBody,
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    },
  });

const runAction = ({
  autumn,
  call,
}: {
  autumn: Autumn;
  call: AtomCall;
}): Promise<unknown> => {
  switch (call.action) {
    case "check":
      return autumn.check(call.params);
    case "track":
      return autumn.track(call.params);
    case "finalize":
      return autumn.balances.finalize(call.params);
    case "getCustomer":
      return autumn.customers.get(call.params);
    case "getEntity":
      return autumn.entities.get(call.params);
  }
};

export async function POST(req: Request) {
  const call = (await req.json()) as AtomCallRequest;
  const secretKey = call.config.secretKey || process.env.ATOM_SECRET_KEY;
  const edgeURL = call.config.edgeURL || process.env.ATOM_EDGE_URL;
  const serverURL =
    call.config.serverURL || process.env.ATOM_SERVER_URL || undefined;

  if (!secretKey) {
    return Response.json(
      {
        error:
          "No secret key: set ATOM_SECRET_KEY in apps/sdk-test/.env.local or paste one under Connection.",
      },
      { status: 400 },
    );
  }

  const attempts: Array<AtomAttempt> = [];
  // failOpen off: the fail-open hook swaps out a custom httpClient, and it would mask edge 5xxs.
  const autumn = new Autumn({
    secretKey,
    serverURL,
    edgeURL,
    useEdge: call.config.useEdge && Boolean(edgeURL),
    failOpen: false,
    httpClient: recordingHTTPClient({ edgeURL, attempts }),
  });

  const start = performance.now();
  let error: string | undefined;
  try {
    await runAction({ autumn, call });
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  const result: AtomCallResult = {
    ms: performance.now() - start,
    attempts,
    error,
  };
  return Response.json(result);
}
