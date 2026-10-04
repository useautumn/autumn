import { AsyncLocalStorage } from "node:async_hooks";
import { variant } from "@autumn/edge-config";
import { createPoolAcquireAttribution } from "@autumn/logging";

export const POOL_ATTRIBUTION_EXPERIMENT = "pool-attribution";

/** Why a checkout happened; the first specific reason in a request's call chain wins. */
export type PoolAcquireReason =
	| "auth"
	| "subject-cache-miss"
	| "subject-uncached"
	| "dragonfly-fallback"
	| "other";

type Attribution = { route: string; reason: PoolAcquireReason };

const ATTRIBUTED_POOL = "critical";
const NO_ROUTE = "(no request)";

const context = new AsyncLocalStorage<Attribution>();
const critical = createPoolAcquireAttribution();
let enabled = false;

/** Staging admin bucket only: prod never runs the request scope or records. */
export const enablePoolAttribution = () => {
	enabled = true;
};

const isArmB = () => enabled && variant(POOL_ATTRIBUTION_EXPERIMENT) === "B";

/** Runs a request inside its route's attribution scope, only while this task's window is on arm B. */
export const runWithPoolRoute = <T>({
	route,
	fn,
}: {
	route: string;
	fn: () => Promise<T>;
}): Promise<T> =>
	isArmB() ? context.run({ route, reason: "other" }, fn) : fn();

/** Tags the checkouts `fn` makes with `reason`, unless an outer call already named one. */
export const withPoolReason = <T>({
	reason,
	fn,
}: {
	reason: PoolAcquireReason;
	fn: () => T;
}): T => {
	const current = context.getStore();
	if (!current || current.reason !== "other") return fn();
	return context.run({ ...current, reason }, fn);
};

/** Captures the caller's scope when a checkout starts; the returned callback records it once it settles. */
export const startPoolAcquire = ({ pool }: { pool: string }) => {
	if (pool !== ATTRIBUTED_POOL || !isArmB()) return null;
	const scope = context.getStore();
	return ({ waitMs, failed }: { waitMs: number; failed: boolean }) =>
		critical.record({
			route: scope?.route ?? NO_ROUTE,
			reason: scope?.reason ?? "other",
			waitMs,
			failed,
		});
};

/** The window's critical-pool attribution for the event-loop line; null when nothing was recorded. */
export const drainPoolAttribution = () => critical.drain();
