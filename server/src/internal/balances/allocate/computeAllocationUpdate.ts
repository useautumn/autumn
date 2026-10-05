import {
	type BalanceAllocationControl,
	type BalanceAllocations,
	cusEntsToBalance,
	cusEntsToGrantedBalance,
	cusEntsToPrepaidQuantity,
	EntityNotFoundError,
	entities,
	type FullSubject,
	findFeatureById,
	fullSubjectToCustomerEntitlements,
	type ResetInterval,
	resetIntvToEntIntv,
} from "@autumn/shared";
import { Decimal } from "decimal.js";
import { and, eq, inArray } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { generateId } from "@/utils/genUtils.js";
import {
	allocationIntervalMismatchError,
	allocationsNotSupportedForUnlimitedError,
	duplicateAllocationEntityError,
	noSharedBalanceForIntervalError,
} from "./allocateBalancesErrors.js";
import { computeAllocationPlan } from "./compute/computeAllocationPlan.js";
import { readAllocationCounters } from "./repos/allocationStore.js";
import {
	allocationCycleOf,
	sharedRowsOf,
	toAllocationCounter,
} from "./utils/allocationRows.js";

const assertUniqueEntities = ({
	params,
}: {
	params: BalanceAllocationControl;
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

export const computeAllocationUpdate = async ({
	ctx,
	params,
	fullSubject,
	tx,
	allocations,
}: {
	ctx: AutumnContext;
	params: BalanceAllocationControl;
	fullSubject: FullSubject;
	tx: DrizzleCli;
	allocations: BalanceAllocations | null;
}) => {
	assertUniqueEntities({ params });
	const feature = findFeatureById({
		features: ctx.features,
		featureId: params.feature_id,
		errorOnNotFound: true,
	});
	const interval = resetIntvToEntIntv({
		resetIntv: params.interval as ResetInterval,
	});

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
				// Expiring purchases already sit on loose grant rows; their quantity only sizes the charge.
				cusEnts: sharedRows.filter((row) => !row.entitlement.expiry_duration),
				sumAcrossEntities: true,
			}),
		)
		.toNumber();
	const sharedRemaining = cusEntsToBalance({ cusEnts: sharedRows });
	const now = Date.now();

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
		featureId: feature.id,
		isFirstCall: !existing,
		sharedGranted,
		sharedRemaining,
		currentAmounts: existing?.amounts ?? {},
		currentUsage: readUsage,
		entries: [
			...Object.keys(existing?.amounts ?? {}).map((internalEntityId) => ({
				internalEntityId,
				amount: 0,
			})),
			...params.allocations.map((entry) => ({
				internalEntityId: internalIdById.get(entry.entity_id) as string,
				amount: entry.amount,
			})),
		],
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

	const counters = [
		...plan.seededEntityIds.map((id) =>
			counterOf(id, plan.entityUsage[id] ?? 0),
		),
		counterOf(null, plan.claimed),
	];
	const allocation = {
		feature_id: feature.id,
		interval,
		scale: plan.scale,
		scale_cycle_end: cycle.windowEndAt,
		parent_customer_entitlement_id: cycle.parentId,
		amounts: plan.amounts,
	};
	return { counters, allocation, internalFeatureId: feature.internal_id };
};
