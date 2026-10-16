import type {
  CheckParams,
  FinalizeBalanceParams,
  GetCustomerParams,
  GetEntityParams,
  TrackParams,
} from "autumn-js";

export type AtomConfig = {
  secretKey: string;
  edgeURL: string;
  serverURL: string;
  useEdge: boolean;
};

export type AtomCall =
  | { action: "check"; params: CheckParams }
  | { action: "track"; params: TrackParams }
  | { action: "finalize"; params: FinalizeBalanceParams }
  | { action: "getCustomer"; params: GetCustomerParams }
  | { action: "getEntity"; params: GetEntityParams };

export type AtomCallRequest = AtomCall & { config: AtomConfig };

export type AtomAttempt = {
  target: "edge" | "api";
  method: string;
  url: string;
  status: number | null;
  ms: number;
  forwarded: boolean;
  requestBody: unknown;
  responseBody?: unknown;
  error?: string;
};

export type AtomCallResult = {
  ms: number;
  attempts: Array<AtomAttempt>;
  error?: string;
};

export type ServedBy = "edge" | "forwarded" | "fallback" | "api" | "none";

export type BalanceView = {
  granted: number | null;
  remaining: number | null;
  usage: number | null;
  /** granted − usage: goes negative in overage, unlike remaining. */
  net: number | null;
  unlimited: boolean;
};
