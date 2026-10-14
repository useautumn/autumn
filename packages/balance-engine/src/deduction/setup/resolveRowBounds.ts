import {
	cusEntToStartingBalance,
	type DbOverageAllowed,
	getMaxOverage,
	isAllocatedCustomerEntitlement,
	isEntityScopedCusEnt,
	isFreeCustomerEntitlement,
	isUnlimitedCustomerEntitlement,
} from "@autumn/shared";
import type { WorkerRollover } from "../../models/subject/rows/workerRollover.js";
import type { WorkerFullCustomerEntitlementWithProduct } from "../../models/subject/workerFullSubject.js";
import type { DeductionRow } from "../types/deductionRow.js";
import type { CreditCost } from "./resolveCreditCosts.js";

const usageAllowedOf = ({
	customerEntitlement,
	control,
	featureHasNativeOverage,
}: {
	customerEntitlement: WorkerFullCustomerEntitlementWithProduct;
	control: DbOverageAllowed | undefined;
	featureHasNativeOverage: boolean;
}): boolean => {
	if (control?.enabled === true && !featureHasNativeOverage) return true;
	if (control?.enabled === false) return false;
	return Boolean(customerEntitlement.usage_allowed);
};

const freeAllocatedOf = ({
	customerEntitlement,
	control,
}: {
	customerEntitlement: WorkerFullCustomerEntitlementWithProduct;
	control: DbOverageAllowed | undefined;
}): boolean =>
	control?.enabled !== false &&
	isAllocatedCustomerEntitlement(customerEntitlement) &&
	isFreeCustomerEntitlement(customerEntitlement);

const isPerEntityMapRow = ({
	customerEntitlement,
}: {
	customerEntitlement: WorkerFullCustomerEntitlementWithProduct;
}): boolean =>
	isEntityScopedCusEnt(customerEntitlement) &&
	customerEntitlement.internal_entity_id == null;

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

type RowBounds = Pick<
	DeductionRow,
	| "id"
	| "featureId"
	| "creditCost"
	| "rateCard"
	| "rateUnits"
	| "ownerId"
	| "usageAllowed"
	| "freeAllocated"
	| "minBalance"
	| "unlimited"
	| "skipsRollovers"
> & { grant: number };

const resolveRowBounds = ({
	customerEntitlement,
	creditCost,
	overageAllowedByFeatureId,
	nativeOverageFeatureIds,
}: {
	customerEntitlement: WorkerFullCustomerEntitlementWithProduct;
	creditCost: CreditCost;
	overageAllowedByFeatureId: Record<string, DbOverageAllowed>;
	nativeOverageFeatureIds: Set<string>;
}): RowBounds => {
	const featureId = customerEntitlement.entitlement.feature.id;
	const unlimited = isUnlimitedCustomerEntitlement({ customerEntitlement });
	const maxOverage = getMaxOverage({ cusEnt: customerEntitlement });
	const control = overageAllowedByFeatureId[featureId];
	const usageAllowed =
		unlimited ||
		usageAllowedOf({
			customerEntitlement,
			control,
			featureHasNativeOverage: nativeOverageFeatureIds.has(featureId),
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
		freeAllocated:
			!unlimited && freeAllocatedOf({ customerEntitlement, control }),
		minBalance: unlimited || maxOverage === undefined ? null : -maxOverage,
		unlimited,
		skipsRollovers: creditCost.skipsRollovers,
		grant: cusEntToStartingBalance({ cusEnt: customerEntitlement }),
	};
};

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

export const customerEntitlementToDeductionRows = ({
	customerEntitlement,
	entityId,
	creditCost,
	overageAllowedByFeatureId,
	nativeOverageFeatureIds,
}: {
	customerEntitlement: WorkerFullCustomerEntitlementWithProduct;
	entityId: string | null;
	creditCost: CreditCost;
	overageAllowedByFeatureId: Record<string, DbOverageAllowed>;
	nativeOverageFeatureIds: Set<string>;
}): DeductionRow[] => {
	const bounds = resolveRowBounds({
		customerEntitlement,
		creditCost,
		overageAllowedByFeatureId,
		nativeOverageFeatureIds,
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
	freeAllocated: false,
	minBalance: 0,
	maxBalance: 0,
	unlimited: false,
	skipsRollovers: false,
});
