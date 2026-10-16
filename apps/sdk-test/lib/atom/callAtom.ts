import type {
  AtomAttempt,
  AtomCallRequest,
  AtomCallResult,
  BalanceView,
  ServedBy,
} from "@/lib/atom/types";

export const callAtom = async ({
  request,
}: {
  request: AtomCallRequest;
}): Promise<AtomCallResult> => {
  const start = performance.now();
  try {
    const res = await fetch("/api/atom", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request),
    });
    const json = await res.json();
    if (!res.ok) {
      return {
        ms: performance.now() - start,
        attempts: [],
        error: json.error ?? `HTTP ${res.status}`,
      };
    }
    return json as AtomCallResult;
  } catch (error) {
    return {
      ms: performance.now() - start,
      attempts: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
};

export const servedByOf = ({
  attempts,
}: {
  attempts: Array<AtomAttempt>;
}): ServedBy => {
  const last = attempts.at(-1);
  if (!last) return "none";
  if (last.target === "edge") return last.forwarded ? "forwarded" : "edge";
  return attempts.some((a) => a.target === "edge") ? "fallback" : "api";
};

export const responseBodyOf = ({ result }: { result: AtomCallResult }) =>
  result.attempts.at(-1)?.responseBody as Record<string, unknown> | undefined;

const toBalanceView = (raw: unknown): BalanceView | null => {
  if (!raw || typeof raw !== "object") return null;
  const b = raw as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === "number" ? v : null);
  const granted = num(b.granted);
  const usage = num(b.usage);
  const remaining = num(b.remaining);
  return {
    granted,
    remaining,
    usage,
    net: granted !== null && usage !== null ? granted - usage : remaining,
    unlimited: b.unlimited === true,
  };
};

export const balanceFromCheck = ({ result }: { result: AtomCallResult }) =>
  toBalanceView(responseBodyOf({ result })?.balance);

export const balanceFromCustomer = ({
  result,
  featureId,
}: {
  result: AtomCallResult;
  featureId: string;
}) => {
  const balances = responseBodyOf({ result })?.balances as
    | Record<string, unknown>
    | undefined;
  return toBalanceView(balances?.[featureId]);
};

export type Outcome = {
  tone: "good" | "bad" | "neutral";
  text: string;
};

export const outcomeOf = ({ result }: { result: AtomCallResult }): Outcome => {
  const status = result.attempts.at(-1)?.status;
  if (!status) return { tone: "bad", text: "Error" };
  if (status >= 400) return { tone: "bad", text: `Error ${status}` };
  const body = responseBodyOf({ result });
  if (typeof body?.allowed === "boolean") {
    return body.allowed
      ? { tone: "good", text: "Allowed" }
      : { tone: "bad", text: "Denied" };
  }
  if (typeof body?.success === "boolean") {
    return body.success
      ? { tone: "good", text: "Success" }
      : { tone: "bad", text: "Failed" };
  }
  return { tone: "good", text: status === 202 ? "Queued" : "OK" };
};

export const errorMessageOf = ({ result }: { result: AtomCallResult }) => {
  const last = result.attempts.at(-1);
  if (last?.status && last.status >= 400) {
    const body = responseBodyOf({ result });
    return String(body?.message ?? body?.code ?? result.error ?? "Request failed");
  }
  return result.error ?? last?.error;
};

export const netBalanceOf = ({ result }: { result: AtomCallResult }) =>
  balanceFromCheck({ result })?.net ?? null;

export const latencyStats = ({ times }: { times: Array<number> }) => {
  if (times.length === 0) return null;
  const sorted = times.toSorted((a, b) => a - b);
  const at = (p: number) =>
    sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
  return {
    count: sorted.length,
    min: sorted[0],
    avg: times.reduce((sum, ms) => sum + ms, 0) / times.length,
    p50: at(0.5),
    p95: at(0.95),
    max: sorted[sorted.length - 1],
  };
};

export const newLockId = () =>
  `lock_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
