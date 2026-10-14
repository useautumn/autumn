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
	const { fullCustomer, featureQuantities } = initContext;

	const isBoolean = isBooleanEntitlement({ entitlement });
	const isUnlimited = isUnlimitedEntitlement({ entitlement });

	if (isBoolean) {
		return { balance: 0, entities: null };
	}

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

	const price = entToPrice({
		ent: entitlement,
		prices: initContext.fullProduct?.prices ?? [],
	});

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

	const entities = initCustomerEntitlementEntities({
		entitlement,
		customerEntities: fullCustomer.entities,
		startingBalance,
	});

	return { balance: startingBalance, entities };
};
