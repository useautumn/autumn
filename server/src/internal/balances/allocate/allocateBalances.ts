import {
	type AllocateBalancesParamsV0,
	type AllocateBalancesResponse,
	type BalanceAllocations,
	CustomerNotFoundError,
	cusEntsToBalance,
	cusEntsToGrantedBalance,
	cusEntsToPrepaidQuantity,
	EntityNotFoundError,
	entities,
	findFeatureById,
	fullSubjectToCustomerEntitlements,
	type ResetInterval,
	resetIntvToEntIntv,
} from "@autumn/shared";
import { Decimal } from "decimal.js";
import { and, eq, inArray } from "drizzle-orm";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { invalidateCachedFullSubject } from "@/internal/customers/cache/fullSubject/index.js";
import { getFullSubject } from "@/internal/customers/repos/getFullSubject/getFullSubject.js";
import { generateId } from "@/utils/genUtils.js";
import { notifyAllocationsAdjusted } from "./actions/notifyAllocationsAdjusted.js";
import {
	allocationIntervalMismatchError,
	allocationsNotSupportedForUnlimitedError,
	duplicateAllocationEntityError,
	noSharedBalanceForIntervalError,
} from "./allocateBalancesErrors.js";
import {
	allocationPlanToEntityNumbers,
	computeAllocationPlan,
} from "./compute/computeAllocationPlan.js";
import {
	readAllocationCounters,
	withAllocationLock,
	writeAllocations,
} from "./repos/allocationStore.js";
import { setAllocationCounters } from "./repos/setAllocationCounters.js";
import {
	allocationCounterUsage,
	allocationCycleOf,
	sharedRowsOf,
	toAllocationCounter,
} from "./utils/allocationRows.js";

const assertUniqueEntities = ({
	params,
}: {
	params: AllocateBalancesParamsV0;
}) => {
	const seen = new Set<string>();
	for (const { entity_id } of params.allocations) {
		if (seen.has(entity_id))
			throw duplicateAllocationEntityError({ entityId: entity_id });
		seen.add(entity_id);
	}
};

const loadEntityInternalIds = async ({
	ctx,
	internalCustomerId,
	entityIds,
}: {
	ctx: AutumnContext;
	internalCustomerId: string;
	entityIds: string[];
}) => {
	const rows = await ctx.db
		.select({ id: entities.id, internalId: entities.internal_id })
		.from(entities)
		.where(
			and(
				eq(entities.org_id, ctx.org.id),
				eq(entities.env, ctx.env),
				eq(entities.internal_customer_id, internalCustomerId),
				inArray(entities.id, entityIds),
			),
		);
	const internalIdById = new Map(rows.map((row) => [row.id, row.internalId]));
	for (const entityId of entityIds)
		if (!internalIdById.has(entityId))
			throw new EntityNotFoundError({ entityId });
	return internalIdById;
};

/** Patches the customer's per-entity shares of its shared credits on `interval`. */
export const allocateBalances = async ({
	ctx,
	params,
}: {
	ctx: AutumnContext;
	params: AllocateBalancesParamsV0;
}): Promise<AllocateBalancesResponse> => {
	assertUniqueEntities({ params });
	const feature = findFeatureById({
		features: ctx.features,
		featureId: params.feature_id,
		errorOnNotFound: true,
	});
	const interval = resetIntvToEntIntv({
		resetIntv: params.interval as ResetInterval,
	});

	await invalidateCachedFullSubject({
		ctx,
		customerId: params.customer_id,
		source: "allocateBalances",
		flushBalances: true,
	});
	const fullSubject = await getFullSubject({
		ctx,
		customerId: params.customer_id,
		readFrom: "primary",
	});
	if (!fullSubject)
		throw new CustomerNotFoundError({ customerId: params.customer_id });
	const { customer } = fullSubject;

	const sharedRows = sharedRowsOf({
		customerEntitlements: fullSubjectToCustomerEntitlements({ fullSubject }),
		featureId: feature.id,
		interval,
	});
	if (
		sharedRows.some(
			(row) => row.unlimited || row.entitlement.allowance === null,
		)
	)
		throw allocationsNotSupportedForUnlimitedError({ featureId: feature.id });

	const internalIdById = await loadEntityInternalIds({
		ctx,
		internalCustomerId: customer.internal_id,
		entityIds: params.allocations.map((entry) => entry.entity_id),
	});
	// Prepaid packs (a credits add-on) hold their credits as quantity, not allowance.
	const sharedGranted = new Decimal(
		cusEntsToGrantedBalance({ cusEnts: sharedRows }),
	)
		.plus(
			cusEntsToPrepaidQuantity({
				cusEnts: sharedRows,
				sumAcrossEntities: true,
			}),
		)
		.toNumber();
	const sharedRemaining = cusEntsToBalance({ cusEnts: sharedRows });
	const now = Date.now();

	// Read, check and write under the customer row lock, so concurrent calls can't both pass rule 5.
	// Counters bypass the worker until plans can set usage_windows; the eviction below drops any stale copy.
	const { plan, cycle, changed } = await withAllocationLock({
		ctx,
		internalCustomerId: customer.internal_id,
		fn: async ({ tx, allocations }) => {
			const stored = allocations?.[feature.internal_id];
			const existing =
				stored && Object.keys(stored.amounts).length > 0 ? stored : undefined;
			if (existing && existing.interval !== interval)
				throw allocationIntervalMismatchError({
					featureId: feature.id,
					interval: existing.interval,
				});
			const cycle = allocationCycleOf({
				sharedRows,
				interval,
				now,
				pinnedId: existing?.parent_customer_entitlement_id,
			});
			if (!cycle)
				throw noSharedBalanceForIntervalError({
					featureId: feature.id,
					interval: params.interval,
				});

			const readUsage = await readAllocationCounters({
				tx,
				internalCustomerId: customer.internal_id,
				internalFeatureId: feature.internal_id,
				cycle,
			});
			const plan = computeAllocationPlan({
				isFirstCall: !existing,
				sharedGranted,
				sharedRemaining,
				currentAmounts: existing?.amounts ?? {},
				currentUsage: readUsage,
				entries: params.allocations.map((entry) => ({
					internalEntityId: internalIdById.get(entry.entity_id) as string,
					amount: entry.amount,
				})),
			});

			const counterOf = (internalEntityId: string | null, usage: number) => ({
				readUsage: readUsage[internalEntityId ?? ""] ?? 0,
				...toAllocationCounter({
					id: generateId("uw"),
					internalCustomerId: customer.internal_id,
					internalFeatureId: feature.internal_id,
					featureId: feature.id,
					internalEntityId,
					cycle,
					usage,
					now,
				}),
			});
			await setAllocationCounters({
				db: tx,
				counters: [
					...plan.seededEntityIds.map((id) =>
						counterOf(id, plan.entityUsage[id] ?? 0),
					),
					counterOf(null, plan.claimed),
				],
			});
			await writeAllocations({
				ctx,
				tx,
				internalCustomerId: customer.internal_id,
				allocations: {
					...(allocations ?? {}),
					[feature.internal_id]: {
						feature_id: feature.id,
						interval,
						scale: plan.scale,
						scale_cycle_end: cycle.windowEndAt,
						parent_customer_entitlement_id: cycle.parentId,
						amounts: plan.amounts,
					},
				},
			});
			const changed =
				!existing ||
				existing.scale !== plan.scale ||
				JSON.stringify(existing.amounts) !== JSON.stringify(plan.amounts);
			return { plan, cycle, changed };
		},
	});
	await invalidateCachedFullSubject({
		ctx,
		customerId: params.customer_id,
		source: "allocateBalances",
	});
	if (changed)
		void notifyAllocationsAdjusted({ ctx, customerId: params.customer_id });

	const allocated = Object.keys(plan.amounts).reduce(
		(sum, id) =>
			sum +
			allocationPlanToEntityNumbers({ plan, internalEntityId: id }).granted,
		0,
	);
	const heldUnused = Object.keys(plan.amounts).reduce(
		(sum, id) =>
			sum +
			allocationPlanToEntityNumbers({ plan, internalEntityId: id }).remaining,
		0,
	);
	return {
		customer_id: params.customer_id,
		feature_id: feature.id,
		interval: params.interval,
		allocations: params.allocations.map((entry) => ({
			entity_id: entry.entity_id,
			...allocationPlanToEntityNumbers({
				plan,
				internalEntityId: internalIdById.get(entry.entity_id) as string,
			}),
			next_reset_at: cycle.windowEndAt,
		})),
		shared: {
			granted: sharedGranted,
			remaining: sharedRemaining,
			allocated,
			unallocated: Math.max(0, sharedRemaining - heldUnused),
		},
	};
};
