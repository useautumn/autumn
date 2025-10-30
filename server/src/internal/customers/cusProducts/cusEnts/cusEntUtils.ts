import {
	AllowanceType,
	type AppEnv,
	CusProductStatus,
	type Customer,
	type EntitlementWithFeature,
	type Entity,
	type Feature,
	FeatureType,
	type FullCusProduct,
	type FullCustomerEntitlement,
	type FullCustomerPrice,
	getStartingBalance,
	type Organization,
} from "@autumn/shared";
import { logger } from "better-auth";
import { Decimal } from "decimal.js";
import { createStripeCli } from "@/external/connect/createStripeCli.js";
import { getEntOptions } from "@/internal/products/prices/priceUtils.js";
import { notNullish, nullish } from "@/utils/genUtils.js";
import {
	getEntityBalance,
	getSummedEntityBalances,
} from "./entBalanceUtils.js";

export const getCusEntMasterBalance = ({
	cusEnt,
	entities,
}: {
	cusEnt: FullCustomerEntitlement;
	entities: Entity[];
}) => {
	const ent = cusEnt.entitlement;
	const feature = ent.feature;

	if (notNullish(ent.entity_feature_id)) {
		const totalBalance = Object.values(cusEnt.entities || {}).reduce(
			(acc, curr) => {
				return acc + curr.balance;
			},
			0,
		);

		const totalAdjustment = Object.values(cusEnt.entities || {}).reduce(
			(acc, curr) => {
				return acc + curr.adjustment;
			},
			0,
		);

		return {
			balance: totalBalance,
			adjustment: totalAdjustment,
			count: Object.values(cusEnt.entities || {}).length,
		};
	}

	// Get unused count

	return {
		balance: cusEnt.balance,
		adjustment: cusEnt.adjustment,
		count: 1,
		unused: cusEnt.replaceables?.length || 0,
	};
};

export const getCusEntBalance = ({
	cusEnt,
	entityId,
}: {
	cusEnt: FullCustomerEntitlement;
	entityId?: string | null;
}) => {
	const entitlement = cusEnt.entitlement;
	const ent = cusEnt.entitlement;
	const feature = ent.feature;

	if (notNullish(entitlement.entity_feature_id)) {
		if (nullish(entityId)) {
			return getSummedEntityBalances({
				cusEnt,
			});
		}

		return {
			...getEntityBalance({
				cusEnt,
				entityId: entityId!,
			}),
			unused: 0,
			count: 1,
		};
	}

	return {
		balance: cusEnt.balance,
		adjustment: cusEnt.adjustment,
		unused: cusEnt.replaceables?.length || 0,
		count: 1,
	};
};

// Get related cusPrice
export const getRelatedCusPrice = (
	cusEnt: FullCustomerEntitlement,
	cusPrices: FullCustomerPrice[],
) => {
	return cusPrices.find((cusPrice) => {
		const productMatch =
			cusPrice.customer_product_id === cusEnt.customer_product_id;

		const entMatch = cusPrice.price.entitlement_id === cusEnt.entitlement.id;

		return productMatch && entMatch;
	});
};

// 3. Perform deductions and update customer balance
export const updateCusEntInStripe = async ({
	cusEnt,
	cusPrices,
	org,
	env,
	customer,
	amountUsed,
	eventId,
}: {
	cusEnt: FullCustomerEntitlement;
	cusPrices: FullCustomerPrice[];
	org: Organization;
	env: AppEnv;
	customer: Customer;
	amountUsed: number;
	eventId: string;
}) => {
	const relatedCusPrice = getRelatedCusPrice(cusEnt, cusPrices);

	if (!relatedCusPrice) {
		return;
	}

	// Send event to Stripe
	const stripeCli = createStripeCli({
		org,
		env,
	});

	await stripeCli.billing.meterEvents.create({
		event_name: relatedCusPrice.price.id!,
		payload: {
			stripe_customer_id: customer.processor.id,
			value: amountUsed.toString(),
		},
		identifier: eventId,
	});
	console.log(`   ✅ Stripe event sent, amount: (${amountUsed})`);
};

// Get balance
// export const getResetBalance = ({
// 	entitlement,
// 	options,
// 	relatedPrice,
// 	productQuantity,
// }: {
// 	entitlement: Entitlement;
// 	options: FeatureOptions | undefined | null;
// 	relatedPrice?: Price | null;
// 	productQuantity?: number;
// }) => {
// 	// 1. No related price
// 	if (!relatedPrice) {
// 		return (entitlement.allowance || 0) * (productQuantity || 1);
// 	}

// 	let config = relatedPrice.config as UsagePriceConfig;

// 	let billingType = getBillingType(config);
// 	if (billingType != BillingType.UsageInAdvance) {
// 		return entitlement.allowance || 0;
// 	}

// 	let quantity = options?.quantity;
// 	let billingUnits = (relatedPrice.config as UsagePriceConfig).billing_units;
// 	if (nullish(quantity) || nullish(billingUnits)) {
// 		return entitlement.allowance || 0;
// 	}

// 	try {
// 		return (entitlement.allowance || 0) + quantity! * billingUnits!;
// 	} catch (error) {
// 		console.log(
// 			"WARNING: Failed to return quantity * billing units, returning allowance...",
// 		);
// 		return entitlement.allowance || 0;
// 	}
// };

export const getUnlimitedAndUsageAllowed = ({
	cusEnts,
	internalFeatureId,
	includeUsageLimit = true,
}: {
	cusEnts: FullCustomerEntitlement[];
	internalFeatureId: string;
	includeUsageLimit?: boolean;
}) => {
	// Unlimited

	const unlimited = cusEnts.some(
		(cusEnt) =>
			cusEnt.internal_feature_id === internalFeatureId &&
			(cusEnt.entitlement.allowance_type === AllowanceType.Unlimited ||
				cusEnt.unlimited),
	);

	const usageAllowed = cusEnts.some(
		(ent) =>
			ent.internal_feature_id === internalFeatureId &&
			ent.usage_allowed &&
			(includeUsageLimit ? nullish(ent.entitlement.usage_limit) : true),
	);

	return { unlimited, usageAllowed };
};

export const getFeatureBalance = ({
	cusEnts,
	internalFeatureId,
	entityId,
}: {
	cusEnts: FullCustomerEntitlement[];
	internalFeatureId: string;
	entityId?: string;
}) => {
	let balance = 0;

	const { unlimited } = getUnlimitedAndUsageAllowed({
		cusEnts,
		internalFeatureId,
	});

	if (unlimited) {
		return null;
	}

	for (const cusEnt of cusEnts) {
		if (cusEnt.internal_feature_id !== internalFeatureId) {
			continue;
		}

		if (cusEnt.entitlement.allowance_type === AllowanceType.Unlimited) {
			return null;
		}

		// 1. If feature entity exists...
		let cusEntBalance = cusEnt.balance!;

		// If entity feature id exists, then it is grouped...
		const entityFeatureId = cusEnt.entitlement.entity_feature_id;

		if (notNullish(entityFeatureId)) {
			if (notNullish(entityId)) {
				const { balance: entityBalance } = getEntityBalance({
					cusEnt,
					entityId: entityId!,
				});
				cusEntBalance = entityBalance!;
			} else {
				const summed = getSummedEntityBalances({
					cusEnt,
				});
				cusEntBalance = summed.balance;
			}
		}

		balance += cusEntBalance;

		// 2. If no entityId provided, use main balance
	}

	return balance;
};

export const getPaidFeatureBalance = ({
	cusEnts,
	internalFeatureId,
}: {
	cusEnts: FullCustomerEntitlement[];
	internalFeatureId: string;
}) => {
	let paidAllowance = 0;
	try {
		for (const cusEnt of cusEnts) {
			if (cusEnt.internal_feature_id !== internalFeatureId) continue;

			if (notNullish(cusEnt.entitlement.usage_limit)) {
				paidAllowance = new Decimal(paidAllowance)
					.plus(cusEnt.entitlement.usage_limit!)
					.minus(cusEnt.entitlement.allowance || 0)
					.toNumber();
			}
		}
	} catch (error) {
		logger.error(`Failed to get paid feature balance`, { error });
	}

	return paidAllowance;
};

export const cusEntsContainFeature = ({
	cusEnts,
	feature,
}: {
	cusEnts: FullCustomerEntitlement[];
	feature: Feature;
}) => {
	return cusEnts.some(
		(cusEnt) => cusEnt.internal_feature_id === feature.internal_id!,
	);
};

export const getTotalNegativeBalance = ({
	cusEnt,
	balance,
	entities,
	billingUnits,
}: {
	cusEnt: FullCustomerEntitlement;
	balance: number;
	entities: Record<string, { balance: number; adjustment: number }>;
	billingUnits?: number;
}) => {
	const entityFeatureId = cusEnt.entitlement.entity_feature_id;

	if (nullish(entityFeatureId)) {
		return balance;
	}

	let totalNegative = 0;
	for (const group in entities) {
		if (entities[group].balance < 0) {
			let balance = entities[group].balance;
			if (billingUnits) {
				balance = new Decimal(balance)
					.div(billingUnits)
					.round()
					.mul(billingUnits)
					.toNumber();
			}
			totalNegative += balance;
		}
	}

	if (totalNegative == 0) {
		if (Object.values(entities).length > 0) {
			const entityBalances = Object.values(entities).map((e) => e.balance || 0);
			return Math.min(...entityBalances);
		} else {
			return cusEnt.entitlement.allowance || 0;
		}
	}

	return totalNegative;
};

// GET EXISTING USAGE
export const getExistingUsageFromCusProducts = ({
	entitlement,
	cusProducts,
	entities,
	carryExistingUsages = false,
	internalEntityId,
}: {
	entitlement: EntitlementWithFeature;
	cusProducts?: FullCusProduct[];
	entities: Entity[];
	carryExistingUsages?: boolean;
	internalEntityId?: string;
}) => {
	if (!entitlement || entitlement.feature.type === FeatureType.Boolean) {
		return 0;
	}

	// Existing usage should also include entities
	const entityUsage = entities.reduce((acc, entity) => {
		if (entity.internal_feature_id !== entitlement.internal_feature_id) {
			return acc;
		}

		return acc + 1;
	}, 0);

	if (entityUsage > 0) {
		return entityUsage;
	}

	let existingUsage = 0;

	// NOTE: Assuming that feature entitlements are unique to each main product...
	const existingCusEnt = cusProducts
		?.filter(
			(cp) =>
				(cp.status === CusProductStatus.Active ||
					cp.status === CusProductStatus.PastDue) &&
				!cp.product.is_add_on &&
				(internalEntityId
					? cp.internal_entity_id === internalEntityId
					: nullish(cp.internal_entity_id)),
		)
		.flatMap((cp) => cp.customer_entitlements)
		.find((ce) => ce.internal_feature_id === entitlement.internal_feature_id);

	if (
		!existingCusEnt ||
		(!entitlement.carry_from_previous && !carryExistingUsages)
	) {
		return existingUsage;
	}

	if (
		nullish(existingCusEnt.balance) ||
		existingCusEnt.entitlement.allowance_type === AllowanceType.Unlimited
	) {
		return existingUsage;
	}

	// Get options
	const cusProduct = cusProducts?.find(
		(cp) => cp.id === existingCusEnt.customer_product_id,
	);
	const options = getEntOptions(
		cusProduct?.options || [],
		existingCusEnt.entitlement,
	);
	const price = getRelatedCusPrice(
		existingCusEnt,
		cusProduct?.customer_prices || [],
	);
	const existingAllowance = getStartingBalance({
		entitlement: existingCusEnt.entitlement,
		options: options || undefined,
		relatedPrice: price?.price,
	});

	const { balance, adjustment, count, unused } = getCusEntMasterBalance({
		cusEnt: existingCusEnt as any,
		entities: entities,
	});

	existingUsage = existingAllowance! - balance!;
	if (unused && unused > 0) {
		existingUsage -= unused;
	}

	return existingUsage;
};
