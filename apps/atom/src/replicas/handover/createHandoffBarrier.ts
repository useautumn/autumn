import type { ThreadCounters } from "../../threads/stats/threadStats.js";
import { HANDOFF_BARRIER_MS } from "./handoffContract.js";

/** A customer's arrival is remembered this long: longer than any leaving peer stays leaving. */
const ARRIVED_TTL_MS = 60_000;

export type HandoffBarrier = {
	/** Holds until the customer's handoff has arrived, or the barrier's time is up: then the caller answers from its copy. */
	wait(params: { customerId: string }): Promise<"arrived" | "late">;
	arrived(params: { customerId: string }): void;
};

/**
 * Between the moment this replica owns a moved customer and the moment the old owner's entries for it land: its first
 * requests wait a little, so the customer sees one view and never a jump back.
 */
export const createHandoffBarrier = ({
	ctx,
}: {
	ctx: {
		counters?: Pick<ThreadCounters, "add">;
		now?: () => number;
		barrierMs?: number;
	};
}): HandoffBarrier => {
	const now = ctx.now ?? Date.now;
	const barrierMs = ctx.barrierMs ?? HANDOFF_BARRIER_MS;
	const arrivedAt = new Map<string, number>();
	const waiting = new Map<string, (() => void)[]>();

	const forgetOld = () => {
		const cutoff = now() - ARRIVED_TTL_MS;
		for (const [customerId, at] of arrivedAt)
			if (at < cutoff) arrivedAt.delete(customerId);
	};

	return {
		async wait({ customerId }) {
			if (arrivedAt.has(customerId)) return "arrived";
			const outcome = await new Promise<"arrived" | "late">((resolve) => {
				const timer = setTimeout(() => resolve("late"), barrierMs);
				const waiters = waiting.get(customerId) ?? [];
				waiters.push(() => {
					clearTimeout(timer);
					resolve("arrived");
				});
				waiting.set(customerId, waiters);
			});
			if (outcome === "late") ctx.counters?.add("handoffLate");
			return outcome;
		},
		arrived({ customerId }) {
			forgetOld();
			arrivedAt.set(customerId, now());
			for (const wake of waiting.get(customerId) ?? []) wake();
			waiting.delete(customerId);
		},
	};
};
