import { asc, inArray } from "drizzle-orm";
import { runs } from "../../../db/schema/runs.ts";
import { createContext, SYSTEM_ACTOR } from "../../../lib/createContext.ts";
import type { TwdContext } from "../../../lib/types/twdContext.ts";
import { getKeyGate } from "../../keys/repos/keyGateRepo.ts";
import { LIVE_RUN_STATUSES } from "../../runs/repos/runsRepo.ts";
import {
	type ClaimedAccount,
	claimAccountsForRun,
} from "../actions/accountLedger.ts";
import { countHeldAccountsByRun } from "../repos/accountCountsRepo.ts";
import { topUpPool } from "./topUpPool.ts";

const TICK_MS = 2_000;
const CLAIM_CHUNK = 32;

/** A swarm job ready to take accounts. The allocator lowers `wants` by what it delivers. */
export type RunDemand = {
	wants: number;
	deliver: (accounts: ClaimedAccount[]) => void;
};

const demands = new Map<string, RunDemand>();
let allocatorCtx: TwdContext | undefined;
let ticking: Promise<void> | undefined;
let tickAgain = false;

/** Strict FIFO: each run (oldest first) is filled before any later run gets an account. */
const allocate = async ({ ctx }: { ctx: TwdContext }) => {
	if (demands.size === 0) return;
	if ((await getKeyGate({ db: ctx.db })).state === "draining") return;
	const [live, held] = await Promise.all([
		ctx.db
			.select({
				id: runs.id,
				workersWanted: runs.workersWanted,
				createdBy: runs.createdBy,
			})
			.from(runs)
			.where(inArray(runs.status, LIVE_RUN_STATUSES))
			.orderBy(asc(runs.createdAt)),
		countHeldAccountsByRun({ db: ctx.db }),
	]);
	for (const run of live) {
		const demand = demands.get(run.id);
		if (!demand) continue;
		const need = Math.min(
			demand.wants,
			(run.workersWanted ?? 0) - (held.get(run.id) ?? 0),
		);
		if (need <= 0) continue;
		let claimed = 0;
		let short = false;
		// Each claim verifies every account on Stripe, so deliver per chunk and workers start immediately.
		while (claimed < need && !short && demand.wants > 0) {
			const chunk = Math.min(CLAIM_CHUNK, need - claimed, demand.wants);
			const accounts = await claimAccountsForRun({
				ctx,
				runId: run.id,
				heldBy: run.createdBy,
				count: chunk,
			});
			if (accounts.length > 0) {
				claimed += accounts.length;
				demand.wants -= accounts.length;
				demand.deliver(accounts);
			}
			short = accounts.length < chunk;
		}
		if (short) {
			topUpPool({ ctx })
				?.then((created) => {
					if (created > 0) kickAllocator();
				})
				.catch((error: unknown) =>
					ctx.logger.warn("twd pool top-up failed", { error: String(error) }),
				);
			return;
		}
	}
};

/** Run an allocation pass now (coalesced with one in flight). */
export const kickAllocator = () => {
	const ctx = allocatorCtx;
	if (!ctx) return;
	if (ticking) {
		tickAgain = true;
		return;
	}
	ticking = (async () => {
		do {
			tickAgain = false;
			await allocate({ ctx }).catch((error: unknown) =>
				ctx.logger.warn("twd allocator pass failed", { error: String(error) }),
			);
		} while (tickAgain);
	})().finally(() => {
		ticking = undefined;
	});
};

/** Registers a run's demand; returns the unregister function. */
export const registerRunDemand = ({
	runId,
	demand,
}: {
	runId: string;
	demand: RunDemand;
}): (() => void) => {
	demands.set(runId, demand);
	kickAllocator();
	return () => {
		if (demands.get(runId) === demand) demands.delete(runId);
	};
};

/** Accounts a registered run can still use now; undefined when the run is not taking accounts. */
export const getRunDemand = ({ runId }: { runId: string }) =>
	demands.get(runId)?.wants;

export const startAllocator = (): (() => void) => {
	allocatorCtx = createContext({ actor: SYSTEM_ACTOR });
	const timer = setInterval(kickAllocator, TICK_MS);
	return () => {
		clearInterval(timer);
		allocatorCtx = undefined;
	};
};
