import {
	type EntitlementWithFeature,
	type EntityBalance,
	entToOptions,
	entToPrice,
	type FeatureOptions,
	type FullCustomer,
	type FullProduct,
	getStartingBalance,
	type InitCustomerEntitlementContext,
	isBooleanEntitlement,
	isLosingPrepaidQuantityPrice,
	isUnlimitedEntitlement,
} from "@autumn/shared";
import { initCustomerEntitlementEntities } from "./initCustomerEntitlementEntities";

export const initCustomerEntitlementBalance = ({
	initContext,
	entitlement,
	productQuantity,
}: {
	initContext:
		| InitCustomerEntitlementContext
		| {
				fullCustomer: FullCustomer;
				fullProduct: FullProduct;
				featureQuantities: FeatureOptions[];
		  };
	entitlement: EntitlementWithFeature;
	/** Instances of the plan on the row; included usage scales with it. */
	productQuantity?: number;
}): { balance: number; entities: Record<string, EntityBalance> | null } => {
	const { fullCustomer, featureQuantities } = initContext;

	// 1. If entitlement is boolean or unlimited, return 0
	const isBoolean = isBooleanEntitlement({ entitlement });
	const isUnlimited = isUnlimitedEntitlement({ entitlement });

	if (isBoolean) {
		return { balance: 0, entities: null };
	}

	// Unlimited entity rows still need their entity map so per-entity usage
	// counters sync back to the DB instead of tripping ENTITY_COUNT_MISMATCH.
	if (isUnlimited) {
		return {
			balance: 0,
			entities: initCustomerEntitlementEntities({
				entitlement,
				customerEntities: fullCustomer.entities,
				startingBalance: 0,
			}),
		};
	}

	// 2. Get starting balance

	const price = entToPrice({
		ent: entitlement,
		prices: initContext.fullProduct?.prices ?? [],
	});

	// Tie-break: a losing prepaid price (e.g. one-off alongside a recurring
	// prepaid of the same feature) must not read the feature-keyed quantity.
	const priceLosesQuantity =
		price &&
		isLosingPrepaidQuantityPrice({
			price,
			prices: initContext.fullProduct?.prices ?? [],
		});

	const options = priceLosesQuantity
		? undefined
		: entToOptions({
				ent: entitlement,
				options: featureQuantities,
			});

	const startingBalance = getStartingBalance({
		entitlement,
		options,
		relatedPrice: price,
		productQuantity,
	});

	// 3. Get entitlement entities if entity scoped
	const entities = initCustomerEntitlementEntities({
		entitlement,
		customerEntities: fullCustomer.entities,
		startingBalance,
	});

	return { balance: startingBalance, entities };
};
