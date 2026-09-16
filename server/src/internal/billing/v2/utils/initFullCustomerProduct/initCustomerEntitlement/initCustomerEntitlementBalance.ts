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
}: {
	initContext:
		| InitCustomerEntitlementContext
		| {
				fullCustomer: FullCustomer;
				fullProduct: FullProduct;
				featureQuantities: FeatureOptions[];
		  };
	entitlement: EntitlementWithFeature;
}): { balance: number; entities: Record<string, EntityBalance> | null } => {
	// 1. Boolean and unlimited entitlements carry no balance
	const isBoolean = isBooleanEntitlement({ entitlement });
	const isUnlimited = isUnlimitedEntitlement({ entitlement });

	if (isBoolean) {
		return { balance: 0, entities: null };
	}

	const { fullCustomer, featureQuantities } = initContext;

	// Unlimited grants carry no balance, but an entity-scoped one still needs
	// its per-entity map seeded for every existing entity: cusEntMatchesEntity
	// only admits entities present in a non-empty map, and entity creation
	// later fills in just the new entity, which would lock the older ones out.
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
	});

	// 3. Get entitlement entities if entity scoped
	const entities = initCustomerEntitlementEntities({
		entitlement,
		customerEntities: fullCustomer.entities,
		startingBalance,
	});

	return { balance: startingBalance, entities };
};
