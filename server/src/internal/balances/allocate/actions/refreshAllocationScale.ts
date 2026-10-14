import {
	type BalanceAllocations,
	cusEntsToBalance,
	customers,
	type FullSubject,
	fullSubjectToCustomerEntitlements,
	solveAllocationScale,
} from "@autumn/shared";
import { and, eq, or } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { flushBalanceWorkerCustomer } from "@/internal/balances/balanceWorker/flushBalanceWorkerCustomer.js";
import { invalidateCachedFullSubject } from "@/internal/customers/cache/fullSubject/index.js";
import { getFullSubject } from "@/internal/customers/repos/getFullSubject/getFullSubject.js";
import { isBalanceWorkerRolloutEnabled } from "@/internal/misc/rollouts/isBalanceWorkerRolloutEnabled.js";
import { generateId } from "@/utils/genUtils.js";
import {
	readAllocationCounters,
	withAllocationLock,
	writeAllocations,
} from "../repos/allocationStore.js";
import { setAllocationCounters } from "../repos/setAllocationCounters.js";
import {
	allocationCycleOf,
	sharedRowsOf,
	toAllocationCounter,
} from "../utils/allocationRows.js";
import { notifyAllocationsAdjusted } from "./notifyAllocationsAdjusted.js";
import {
	type AllocationCounterPatch,
	patchCachedAllocations,
} from "./patchCachedAllocations.js";

const hasStoredAllocations = async ({
	ctx,
	customerId,
}: {
	ctx: AutumnContext;
	customerId: string;
}): Promise<boolean> => {
	const [row] = await ctx.db
		.select({ balanceAllocations: customers.balance_allocations })
		.from(customers)
		.where(
			and(
				eq(customers.org_id, ctx.org.id),
				eq(customers.env, ctx.env),
				or(eq(customers.id, customerId), eq(customers.internal_id, customerId)),
			),
		)
		.limit(1);
	return Object.keys(row?.balanceAllocations ?? {}).length > 0;
};

const refitAllocations = async ({
	ctx,
	tx,
	fullSubject,
	allocations,
	now,
}: {
	ctx: AutumnContext;
	tx: DrizzleCli;
	fullSubject: FullSubject;
	allocations: BalanceAllocations;
	now: number;
}): Promise<{
	next: BalanceAllocations;
	changed: boolean;
	dirty: boolean;
	counterPatches: AllocationCounterPatch[];
}> => {
	const customerEntitlements = fullSubjectToCustomerEntitlements({
		fullSubject,
	});
	const internalCustomerId = fullSubject.customer.internal_id;
	const next: BalanceAllocations = { ...allocations };
	const counterPatches: AllocationCounterPatch[] = [];
	let changed = false;
	let dirty = false;
	for (const [internalFeatureId, allocation] of Object.entries(allocations)) {
		const sharedRows = sharedRowsOf({
			customerEntitlements,
			featureId: allocation.feature_id,
			interval: allocation.interval,
		});
		const cycle = allocationCycleOf({
			sharedRows,
			interval: allocation.interval,
			now,
			pinnedId: allocation.parent_customer_entitlement_id,
		});
		if (!cycle) continue;
		const usage = await readAllocationCounters({
			tx,
			internalCustomerId,
			internalFeatureId,
			cycle,
		});
		const claimed = Object.entries(allocation.amounts).reduce(
			(sum, [id, requested]) => sum + Math.min(usage[id] ?? 0, requested),
			0,
		);
		const readClaimed = usage[""] ?? 0;
		if (claimed !== readClaimed) {
			const counter = toAllocationCounter({
				id: generateId("uw"),
				internalCustomerId,
				internalFeatureId,
				featureId: allocation.feature_id,
				internalEntityId: null,
				cycle,
				usage: claimed,
				now: Date.now(),
			});
			await setAllocationCounters({
				db: tx,
				counters: [{ readUsage: readClaimed, ...counter }],
			});
			counterPatches.push({ counter, usageDelta: claimed - readClaimed });
		}
		const scale = solveAllocationScale({
			sharedRemaining: cusEntsToBalance({ cusEnts: sharedRows }),
			entries: Object.entries(allocation.amounts).map(([id, requested]) => ({
				requested,
				usage: usage[id] ?? 0,
			})),
		});
		const unchanged =
			scale === allocation.scale &&
			cycle.windowEndAt === allocation.scale_cycle_end &&
			cycle.parentId === allocation.parent_customer_entitlement_id;
		if (unchanged) continue;
		next[internalFeatureId] = {
			...allocation,
			scale,
			scale_cycle_end: cycle.windowEndAt,
			parent_customer_entitlement_id: cycle.parentId,
		};
		changed ||= scale !== allocation.scale;
		dirty = true;
	}
	if (dirty)
		await writeAllocations({ ctx, tx, internalCustomerId, allocations: next });
	return { next, changed, dirty, counterPatches };
};

const loadFreshSubject = async ({
	ctx,
	customerId,
	flushBalances,
}: {
	ctx: AutumnContext;
	customerId: string;
	flushBalances: boolean;
}) => {
	const routed = isBalanceWorkerRolloutEnabled({ ctx, customerId });
	if (flushBalances)
		await invalidateCachedFullSubject({
			ctx,
			customerId,
			source: "refreshAllocationScale",
			flushBalances: true,
		});
	else if (routed) await flushBalanceWorkerCustomer({ ctx, customerId });
	return getFullSubject({
		ctx,
		customerId,
		readFrom: "primary",
		runLazyResets: !routed,
	});
};

export type AllocationRefresh = {
	adjusted: boolean;
	written: BalanceAllocations | null;
};

const NO_REFRESH: AllocationRefresh = { adjusted: false, written: null };

export const refreshAllocationScale = async ({
	ctx,
	customerId,
	notify = true,
	flushBalances = true,
	now = Date.now(),
}: {
	ctx: AutumnContext;
	customerId: string;
	notify?: boolean;
	flushBalances?: boolean;
	now?: number;
}): Promise<AllocationRefresh> => {
	if (!(await hasStoredAllocations({ ctx, customerId }))) return NO_REFRESH;
	const fullSubject = await loadFreshSubject({
		ctx,
		customerId,
		flushBalances,
	});
	if (!fullSubject) return NO_REFRESH;

	const refit = await withAllocationLock({
		ctx,
		internalCustomerId: fullSubject.customer.internal_id,
		fn: async ({ tx, allocations }) =>
			allocations
				? refitAllocations({
						ctx,
						tx,
						fullSubject,
						allocations,
						now,
					})
				: null,
	});
	if (!refit) return NO_REFRESH;
	if (refit.dirty || refit.counterPatches.length > 0)
		await patchCachedAllocations({
			ctx,
			customerId: fullSubject.customerId,
			allocations: refit.next,
			counterPatches: refit.counterPatches,
			flushBalances,
		});
	const { changed } = refit;
	const written = refit.dirty ? refit.next : null;
	if (changed && notify) void notifyAllocationsAdjusted({ ctx, customerId });
	return { adjusted: changed, written };
};

export const refreshAllocationScaleAfterWrite = async ({
	ctx,
	customerId,
	notify = true,
	now = Date.now(),
}: {
	ctx: AutumnContext;
	customerId: string;
	notify?: boolean;
	/** The event time, so Stripe test clocks pick the right cycle. */
	now?: number;
}): Promise<AllocationRefresh> => {
	try {
		return await refreshAllocationScale({
			ctx,
			customerId,
			notify,
			flushBalances: false,
			now,
		});
	} catch (error) {
		ctx.logger.error("[refreshAllocationScale] after balance write failed", {
			error,
		});
		return NO_REFRESH;
	}
};

const withoutEntity = ({
	allocations,
	internalEntityId,
}: {
	allocations: BalanceAllocations;
	internalEntityId: string;
}): BalanceAllocations => {
	const remaining: BalanceAllocations = {};
	for (const [internalFeatureId, allocation] of Object.entries(allocations)) {
		const { [internalEntityId]: _released, ...amounts } = allocation.amounts;
		if (Object.keys(amounts).length === 0) continue;
		remaining[internalFeatureId] = { ...allocation, amounts };
	}
	return remaining;
};

export const releaseEntityAllocations = async ({
	ctx,
	customerId,
	internalEntityId,
}: {
	ctx: AutumnContext;
	customerId: string;
	internalEntityId: string;
}): Promise<void> => {
	if (!(await hasStoredAllocations({ ctx, customerId }))) return;
	const fullSubject = await loadFreshSubject({
		ctx,
		customerId,
		flushBalances: false,
	});
	if (!fullSubject) return;

	const released = await withAllocationLock({
		ctx,
		internalCustomerId: fullSubject.customer.internal_id,
		fn: async ({ tx, allocations }) => {
			if (!allocations) return null;
			const held = Object.values(allocations).some(
				(allocation) => allocation.amounts[internalEntityId] !== undefined,
			);
			if (!held) return null;
			const remaining = withoutEntity({ allocations, internalEntityId });
			await writeAllocations({
				ctx,
				tx,
				internalCustomerId: fullSubject.customer.internal_id,
				allocations: remaining,
			});
			return refitAllocations({
				ctx,
				tx,
				fullSubject,
				allocations: remaining,
				now: Date.now(),
			});
		},
	});
	if (!released) {
		await refreshAllocationScaleAfterWrite({ ctx, customerId });
		return;
	}
	await patchCachedAllocations({
		ctx,
		customerId: fullSubject.customerId,
		allocations: released.next,
		counterPatches: released.counterPatches,
		flushBalances: false,
	});
	void notifyAllocationsAdjusted({ ctx, customerId });
};
