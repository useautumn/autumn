import {
	type AllocateBalancesParamsV0,
	type AllocateBalancesResponse,
	type BalanceAllocations,
	CustomerNotFoundError,
	cusEntsToBalance,
	cusEntsToGrantedBalance,
	EntityNotFoundError,
	entities,
	findFeatureById,
	fullSubjectToCustomerEntitlements,
	type ResetInterval,
	resetIntvToEntIntv,
} from "@autumn/shared";
import { and, eq, inArray } from "drizzle-orm";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { executeAutumnBillingPlan } from "@/internal/billing/v2/execute/executeAutumnBillingPlan/executeAutumnBillingPlan.js";
import { invalidateCachedFullSubject } from "@/internal/customers/cache/fullSubject/index.js";
import { getFullSubject } from "@/internal/customers/repos/getFullSubject/getFullSubject.js";
import { generateId } from "@/utils/genUtils.js";
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
		if (!internalIdById.has(entityId)) throw new EntityNotFoundError({ entityId });
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

	const existing = customer.balance_allocations?.[feature.internal_id];
	if (existing && existing.interval !== interval)
		throw allocationIntervalMismatchError({
			featureId: feature.id,
			interval: existing.interval,
		});

	const sharedRows = sharedRowsOf({
		customerEntitlements: fullSubjectToCustomerEntitlements({ fullSubject }),
		featureId: feature.id,
		interval,
	});
	const now = Date.now();
	const cycle = allocationCycleOf({ sharedRows, interval, now });
	if (!cycle)
		throw noSharedBalanceForIntervalError({
			featureId: feature.id,
			interval: params.interval,
		});
	if (sharedRows.some((row) => row.unlimited || row.entitlement.allowance === null))
		throw allocationsNotSupportedForUnlimitedError({ featureId: feature.id });

	const internalIdById = await loadEntityInternalIds({
		ctx,
		internalCustomerId: customer.internal_id,
		entityIds: params.allocations.map((entry) => entry.entity_id),
	});

	const sharedGranted = cusEntsToGrantedBalance({ cusEnts: sharedRows });
	const sharedRemaining = cusEntsToBalance({ cusEnts: sharedRows });
	const counterUsage = allocationCounterUsage({
		fullSubject,
		allocation: { feature_id: feature.id },
		cycle,
	});
	const plan = computeAllocationPlan({
		isFirstCall: !existing,
		sharedGranted,
		sharedRemaining,
		currentAmounts: existing?.amounts ?? {},
		currentUsage: counterUsage,
		entries: params.allocations.map((entry) => ({
			internalEntityId: internalIdById.get(entry.entity_id) as string,
			amount: entry.amount,
		})),
	});

	const counterOf = (internalEntityId: string | null, usage: number) =>
		toAllocationCounter({
			id: generateId("uw"),
			internalCustomerId: customer.internal_id,
			internalFeatureId: feature.internal_id,
			featureId: feature.id,
			internalEntityId,
			cycle,
			usage,
			now,
		});
	// Counters bypass the worker until plans can set usage_windows; the eviction below drops any stale copy.
	await setAllocationCounters({
		db: ctx.db,
		counters: [
			...plan.seededEntityIds.map((id) => counterOf(id, plan.entityUsage[id] ?? 0)),
			counterOf(null, plan.claimed),
		],
	});

	const balanceAllocations: BalanceAllocations = {
		...(customer.balance_allocations ?? {}),
		[feature.internal_id]: {
			feature_id: feature.id,
			interval,
			scale: plan.scale,
			amounts: plan.amounts,
		},
	};
	await executeAutumnBillingPlan({
		ctx,
		autumnBillingPlan: {
			customerId: customer.id ?? customer.internal_id,
			insertCustomerProducts: [],
			updateCustomer: {
				customer,
				updates: { balance_allocations: balanceAllocations },
			},
		},
	});
	await invalidateCachedFullSubject({
		ctx,
		customerId: params.customer_id,
		source: "allocateBalances",
	});

	const allocated = Object.keys(plan.amounts).reduce(
		(sum, id) =>
			sum + allocationPlanToEntityNumbers({ plan, internalEntityId: id }).granted,
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
