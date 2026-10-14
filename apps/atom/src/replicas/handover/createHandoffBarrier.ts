import type { ThreadCounters } from "../../threads/stats/threadStats.js";
import type { Membership } from "../membership/types/membership.js";
import { HANDOFF_BARRIER_MS } from "./handoffContract.js";

/** A customer's arrival is remembered this long: longer than any leaving peer stays leaving. */
const ARRIVED_TTL_MS = 60_000;
/** How often a waiting request looks at the shared table for the leaver's "handed everything" word. */
const COMPLETION_POLL_MS = 5;

export type HandoffBarrier = {
	/** Holds a moved customer's request until its handoff landed on this thread, the leaver said it handed everything, or
	 * the barrier's time is up: then the caller answers from its copy. */
	wait(params: {
		customerId: string;
		from: string;
	}): Promise<"arrived" | "late">;
	arrived(params: { customerId: string }): void;
};

/**
 * On the thread that owns a moved customer's slot, where both its handoff and its requests land: between the moment this
 * replica owns the customer and the moment the old owner's entries for it arrive, its first requests wait a little, so
 * the customer sees one view and never a jump back.
 */
export const createHandoffBarrier = ({
	ctx,
}: {
	ctx: {
		membership?: Pick<Membership, "isHandoffComplete">;
		counters?: Pick<ThreadCounters, "add">;
		now?: () => number;
	};
}): HandoffBarrier => {
	const now = ctx.now ?? Date.now;
	const arrivedAt = new Map<string, number>();
	const waiting = new Map<string, (() => void)[]>();

	const forgetOld = () => {
		const cutoff = now() - ARRIVED_TTL_MS;
		for (const [customerId, at] of arrivedAt)
			if (at < cutoff) arrivedAt.delete(customerId);
	};

	const isComplete = (from: string) =>
		ctx.membership?.isHandoffComplete(from) ?? false;

	return {
		async wait({ customerId, from }) {
			if (arrivedAt.has(customerId) || isComplete(from)) return "arrived";
			const outcome = await new Promise<"arrived" | "late">((resolve) => {
				const deadline = setTimeout(() => settle("late"), HANDOFF_BARRIER_MS);
				const poll = setInterval(() => {
					if (isComplete(from)) settle("arrived");
				}, COMPLETION_POLL_MS);
				const waiters = waiting.get(customerId) ?? [];
				waiters.push(() => settle("arrived"));
				waiting.set(customerId, waiters);
				function settle(result: "arrived" | "late") {
					clearTimeout(deadline);
					clearInterval(poll);
					resolve(result);
				}
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
