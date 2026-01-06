import {
	AllowanceType,
	type AttachReplaceable,
	BillingType,
	type Customer,
	type EntitlementWithFeature,
	type Entity,
	type EntityBalance,
	type FeatureOptions,
	FeatureType,
	type FreeTrial,
	type FullCusProduct,
	type FullCustomerEntitlement,
	getStartingBalance,
	type Price,
	type ProductOptions,
} from "@autumn/shared";
import { Decimal } from "decimal.js";
import { entitlementLinkedToEntity } from "@/internal/api/entities/entityUtils.js";
import { getBillingType } from "@/internal/products/prices/priceUtils.js";
import { generateId, notNullish } from "@/utils/genUtils.js";
import { initNextResetAt } from "../cusProducts/insertCusProduct/initCusEnt/initNextResetAt.js";

export const initCusEntEntities = ({
	entitlement,
	entities,
	existingCusEnt,
	resetBalance,
}: {
	entitlement: EntitlementWithFeature;
	entities: Entity[];
	existingCusEnt?: FullCustomerEntitlement;
	resetBalance?: number | null;
}) => {
	let newEntities: Record<string, EntityBalance> | null = notNullish(
		entitlement.entity_feature_id,
	)
		? {}
		: null;

	for (const entity of entities) {
		if (!entitlementLinkedToEntity({ entitlement, entity })) continue;

		if (existingCusEnt?.entities?.[entity.id]) {
			continue;
		}

		if (!newEntities) {
			newEntities = {};
		}

		newEntities[entity.id] = {
			id: entity.id,
			balance: resetBalance || 0,
			adjustment: 0,
			additional_balance: 0,
		};
	}

	return newEntities;
};

const initCusEntBalance = ({
	entitlement,
	curCusProduct,

	options,
	relatedPrice,
	// existingCusEnt,
	entities,
	carryExistingUsages = false,
}: {
	entitlement: EntitlementWithFeature;
	curCusProduct?: FullCusProduct;

	options?: FeatureOptions;
	relatedPrice?: Price;
	// existingCusEnt?: FullCustomerEntitlement;
	entities: Entity[];
	carryExistingUsages?: boolean;
}) => {
	if (entitlement.feature.type === FeatureType.Boolean) {
		return { newBalance: null, newEntities: null };
	}

	const resetBalance = getStartingBalance({
		entitlement,
		options,
		relatedPrice,
	});

	const newEntities: Record<string, EntityBalance> | null = initCusEntEntities({
		entitlement,
		entities,
		resetBalance,
	});

	return { newBalance: resetBalance, newEntities };
};

// MAIN FUNCTION
export const initCusEntitlement = ({
	entitlement,
	customer,
	entity,
	cusProductId,
	freeTrial,
	options,
	nextResetAt,
	relatedPrice,
	// existingCusEnt,
	// keepResetIntervals = false,
	trialEndsAt,
	anchorToUnix,
	entities,
	carryExistingUsages = false,
	curCusProduct,
	replaceables,
	now,
	productOptions,
}: {
	entitlement: EntitlementWithFeature;
	customer: Customer;
	entity?: Entity;
	cusProductId: string | null;
	freeTrial: FreeTrial | null;
	options?: FeatureOptions;
	nextResetAt?: number;
	relatedPrice?: Price;
	// existingCusEnt?: FullCustomerEntitlement;
	// keepResetIntervals?: boolean;
	trialEndsAt?: number;
	anchorToUnix?: number;
	entities: Entity[];
	carryExistingUsages?: boolean;
	curCusProduct?: FullCusProduct;
	replaceables: AttachReplaceable[];
	now?: number;
	productOptions?: ProductOptions;
}) => {
	now = now || Date.now();
	let { newBalance, newEntities } = initCusEntBalance({
		entitlement,
		options,
		relatedPrice,
		entities,
		carryExistingUsages,
		curCusProduct,
	});

	newBalance =
		(newBalance || 0) -
		replaceables.filter((r) => r.ent.id === entitlement.id).length;

	const nextResetAtValue = initNextResetAt({
		entitlement,
		nextResetAt,
		// keepResetIntervals,
		// existingCusEnt,
		trialEndsAt,
		freeTrial,
		anchorToUnix,
		now,
	});

	// 3. Define expires at (TODO next time...)
	const isBooleanFeature = entitlement.feature.type === FeatureType.Boolean;
	let usageAllowed = false;

	if (
		relatedPrice &&
		(getBillingType(relatedPrice.config!) === BillingType.UsageInArrear ||
			getBillingType(relatedPrice.config!) === BillingType.InArrearProrated)
	) {
		usageAllowed = true;
	}

	if (notNullish(productOptions?.quantity) && notNullish(newBalance)) {
		newBalance = new Decimal(newBalance!)
			.mul(productOptions?.quantity || 1)
			.toNumber();
	}

	return {
		id: generateId("cus_ent"),
		internal_customer_id: customer.internal_id,
		internal_feature_id: entitlement.internal_feature_id,
		internal_entity_id: entity?.internal_id ?? null,
		feature_id: (entitlement.feature_id ?? entitlement.feature.id) as string,
		customer_id: customer.id,

		// Foreign keys
		entitlement_id: entitlement.id,
		customer_product_id: cusProductId,
		created_at: Date.now(),

		// Entitlement fields
		unlimited: isBooleanFeature
			? null
			: entitlement.allowance_type === AllowanceType.Unlimited,
		balance: newBalance || 0,
		additional_balance: 0,
		adjustment: 0,
		entities: newEntities,
		usage_allowed: usageAllowed,
		next_reset_at: nextResetAtValue,
	};
};
