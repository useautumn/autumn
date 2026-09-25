import {
	cusEntToStartingBalance,
	type DbOverageAllowed,
	getMaxOverage,
	isAllocatedCustomerEntitlement,
	isEntityScopedCusEnt,
	isFreeCustomerEntitlement,
	isUnlimitedCustomerEntitlement,
} from "@autumn/shared";
import type { OverageBehavior } from "../../commands/track/types/trackCommand.js";
import type { WorkerRollover } from "../../models/subject/rows/workerRollover.js";
import type { WorkerFullCustomerEntitlementWithProduct } from "../../models/subject/workerFullSubject.js";
import type { DeductionRow } from "../types/deductionRow.js";
import type { CreditCost } from "./resolveCreditCosts.js";

/** The one row whose bounds follow the request: a free allocated grant may run over unless the caller rejects. */
export const isFreeAllocatedRow = ({
	customerEntitlement,
}: {
	customerEntitlement: WorkerFullCustomerEntitlementWithProduct;
}): boolean =>
	isAllocatedCustomerEntitlement(customerEntitlement) &&
	isFreeCustomerEntitlement(customerEntitlement);

/** A plan or customer control can enable or veto overage for the whole feature. */
const usageAllowedOf = ({
	customerEntitlement,
	control,
	featureHasNativeOverage,
	overageBehavior,
}: {
	customerEntitlement: WorkerFullCustomerEntitlementWithProduct;
	control: DbOverageAllowed | undefined;
	featureHasNativeOverage: boolean;
	overageBehavior: OverageBehavior;
}): boolean => {
	const native =
		Boolean(customerEntitlement.usage_allowed) ||
		(isFreeAllocatedRow({ customerEntitlement }) &&
			overageBehavior !== "reject");
	if (control?.enabled === true && !featureHasNativeOverage) return true;
	if (control?.enabled === false) return false;
	return native;
};

/** A customer-level row whose balances live in `entities`; a row of the per-entity kind carries `internal_entity_id` and holds its balance like any row. */
const isPerEntityMapRow = ({
	customerEntitlement,
}: {
	customerEntitlement: WorkerFullCustomerEntitlementWithProduct;
}): boolean =>
	isEntityScopedCusEnt(customerEntitlement) &&
	customerEntitlement.internal_entity_id == null;

/** Which entities a track may draw from on a map row: the one it is for, or every one in key order (the Lua `sorted_keys` draw). */
const entityKeysToDraw = ({
	customerEntitlement,
	entityId,
}: {
	customerEntitlement: WorkerFullCustomerEntitlementWithProduct;
	entityId: string | null;
}): string[] =>
	entityId !== null
		? [entityId]
		: Object.keys(customerEntitlement.entities ?? {}).sort();

/** What every balance on a row shares: how it prices, and how far it may move. */
type RowBounds = Pick<
	DeductionRow,
	| "id"
	| "featureId"
	| "creditCost"
	| "rateCard"
	| "rateUnits"
	| "ownerId"
	| "usageAllowed"
	| "minBalance"
	| "unlimited"
	| "skipsRollovers"
> & { grant: number };

/** How far a row may move: down to its overage floor if usage is allowed, and on a refund back up to its grant plus adjustment. */
const resolveRowBounds = ({
	customerEntitlement,
	creditCost,
	overageAllowedByFeatureId,
	nativeOverageFeatureIds,
	overageBehavior,
}: {
	customerEntitlement: WorkerFullCustomerEntitlementWithProduct;
	creditCost: CreditCost;
	overageAllowedByFeatureId: Record<string, DbOverageAllowed>;
	nativeOverageFeatureIds: Set<string>;
	overageBehavior: OverageBehavior;
}): RowBounds => {
	const featureId = customerEntitlement.entitlement.feature.id;
	const unlimited = isUnlimitedCustomerEntitlement({ customerEntitlement });
	const maxOverage = getMaxOverage({ cusEnt: customerEntitlement });
	const usageAllowed =
		unlimited ||
		usageAllowedOf({
			customerEntitlement,
			control: overageAllowedByFeatureId[featureId],
			featureHasNativeOverage: nativeOverageFeatureIds.has(featureId),
			overageBehavior,
		});
	return {
		id: customerEntitlement.id,
		featureId,
		creditCost: creditCost.creditCost,
		rateCard: creditCost.rateCard,
		rateUnits: creditCost.rateCard
			? (customerEntitlement.usage_attribution?.[
					creditCost.rateCard.source_internal_feature_id
				]?.units ?? 0)
			: 0,
		ownerId: customerEntitlement.id,
		usageAllowed,
		minBalance: unlimited || maxOverage === undefined ? null : -maxOverage,
		unlimited,
		skipsRollovers: creditCost.skipsRollovers,
		grant: cusEntToStartingBalance({ cusEnt: customerEntitlement }),
	};
};

/** One balance on the row as a deduction row: the shared bounds plus where it sits and how far a refund may lift it. */
const balanceToDeductionRow = ({
	bounds: { grant, ...bounds },
	entityKey,
	balance,
	adjustment,
}: {
	bounds: RowBounds;
	entityKey: string | null;
	balance: number;
	adjustment: number;
}): DeductionRow => ({
	table: "customerEntitlements",
	...bounds,
	entityKey,
	balance,
	maxBalance: bounds.unlimited ? null : grant + adjustment,
});

/** A plain row is one deduction row from its balance; a per-entity map row is one per entity balance drawn. */
export const customerEntitlementToDeductionRows = ({
	customerEntitlement,
	entityId,
	creditCost,
	overageAllowedByFeatureId,
	nativeOverageFeatureIds,
	overageBehavior,
}: {
	customerEntitlement: WorkerFullCustomerEntitlementWithProduct;
	entityId: string | null;
	creditCost: CreditCost;
	overageAllowedByFeatureId: Record<string, DbOverageAllowed>;
	nativeOverageFeatureIds: Set<string>;
	overageBehavior: OverageBehavior;
}): DeductionRow[] => {
	const bounds = resolveRowBounds({
		customerEntitlement,
		creditCost,
		overageAllowedByFeatureId,
		nativeOverageFeatureIds,
		overageBehavior,
	});

	if (!isPerEntityMapRow({ customerEntitlement })) {
		return [
			balanceToDeductionRow({
				bounds,
				entityKey: null,
				balance: customerEntitlement.balance,
				adjustment: customerEntitlement.adjustment,
			}),
		];
	}

	return entityKeysToDraw({ customerEntitlement, entityId }).map((entityKey) =>
		balanceToDeductionRow({
			bounds,
			entityKey,
			balance: customerEntitlement.entities?.[entityKey]?.balance ?? 0,
			adjustment: customerEntitlement.entities?.[entityKey]?.adjustment ?? 0,
		}),
	);
};

/** A rollover only ever drains to zero and is never refunded into; it charges at its owner's rate and holds a balance under each key its owner does. */
export const rolloverToDeductionRow = ({
	rollover,
	owner,
}: {
	rollover: WorkerRollover;
	owner: DeductionRow;
}): DeductionRow => ({
	table: "rollovers",
	id: rollover.id,
	entityKey: owner.entityKey,
	featureId: owner.featureId,
	balance:
		owner.entityKey === null
			? rollover.balance
			: (rollover.entities[owner.entityKey]?.balance ?? 0),
	creditCost: owner.creditCost,
	rateCard: owner.rateCard,
	rateUnits: owner.rateUnits,
	ownerId: owner.ownerId,
	usageAllowed: false,
	minBalance: 0,
	maxBalance: 0,
	unlimited: false,
	skipsRollovers: false,
});
