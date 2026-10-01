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
import { invalidateCachedFullSubject } from "@/internal/customers/cache/fullSubject/index.js";
import { getFullSubject } from "@/internal/customers/repos/getFullSubject/getFullSubject.js";
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

/** Re-fits every allocated feature to the shared credits left now, under the allocation lock. Only scale and the claimed counter change. */
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
}): Promise<{ next: BalanceAllocations; changed: boolean }> => {
	const customerEntitlements = fullSubjectToCustomerEntitlements({
		fullSubject,
	});
	const internalCustomerId = fullSubject.customer.internal_id;
	const next: BalanceAllocations = { ...allocations };
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
		// Claimed derives from entity counters; re-deriving it drops released or deleted entities.
		const claimed = Object.entries(allocation.amounts).reduce(
			(sum, [id, requested]) => sum + Math.min(usage[id] ?? 0, requested),
			0,
		);
		if (claimed !== (usage[""] ?? 0))
			await setAllocationCounters({
				db: tx,
				counters: [
					toAllocationCounter({
						id: generateId("uw"),
						internalCustomerId,
						internalFeatureId,
						featureId: allocation.feature_id,
						internalEntityId: null,
						cycle,
						usage: claimed,
						now,
					}),
				],
			});
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
	return { next, changed };
};

const loadFreshSubject = async ({
	ctx,
	customerId,
}: {
	ctx: AutumnContext;
	customerId: string;
}) => {
	await invalidateCachedFullSubject({
		ctx,
		customerId,
		source: "refreshAllocationScale",
		flushBalances: true,
	});
	return getFullSubject({ ctx, customerId, readFrom: "primary" });
};

/** Re-solves each allocated feature's scale against the shared credits left now; reports whether any share moved. */
export const refreshAllocationScale = async ({
	ctx,
	customerId,
	notify = true,
}: {
	ctx: AutumnContext;
	customerId: string;
	/** False when the caller sends its own billing.updated and adds the tag there. */
	notify?: boolean;
}): Promise<boolean> => {
	if (!(await hasStoredAllocations({ ctx, customerId }))) return false;
	const fullSubject = await loadFreshSubject({ ctx, customerId });
	if (!fullSubject) return false;

	const changed = await withAllocationLock({
		ctx,
		internalCustomerId: fullSubject.customer.internal_id,
		fn: async ({ tx, allocations }) =>
			allocations
				? (
						await refitAllocations({
							ctx,
							tx,
							fullSubject,
							allocations,
							now: Date.now(),
						})
					).changed
				: false,
	});
	await invalidateCachedFullSubject({
		ctx,
		customerId,
		source: "refreshAllocationScale",
	});
	if (changed && notify) void notifyAllocationsAdjusted({ ctx, customerId });
	return changed;
};

/** Drops a deleted entity's share and re-fits what's left in one locked write. */
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
	const fullSubject = await loadFreshSubject({ ctx, customerId });
	if (!fullSubject) return;

	const released = await withAllocationLock({
		ctx,
		internalCustomerId: fullSubject.customer.internal_id,
		fn: async ({ tx, allocations }) => {
			if (!allocations) return false;
			const held = Object.values(allocations).some(
				(allocation) => allocation.amounts[internalEntityId] !== undefined,
			);
			if (!held) return false;
			const withoutEntity: BalanceAllocations = Object.fromEntries(
				Object.entries(allocations).map(([internalFeatureId, allocation]) => {
					const { [internalEntityId]: _released, ...amounts } =
						allocation.amounts;
					return [internalFeatureId, { ...allocation, amounts }];
				}),
			);
			await writeAllocations({
				ctx,
				tx,
				internalCustomerId: fullSubject.customer.internal_id,
				allocations: withoutEntity,
			});
			await refitAllocations({
				ctx,
				tx,
				fullSubject,
				allocations: withoutEntity,
				now: Date.now(),
			});
			return true;
		},
	});
	if (!released) return;
	await invalidateCachedFullSubject({
		ctx,
		customerId,
		source: "releaseEntityAllocations",
	});
	void notifyAllocationsAdjusted({ ctx, customerId });
};
