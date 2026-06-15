import type {
	CustomerPlanItemChange,
	FullCusProduct,
	FullCustomerEntitlement,
	FullCustomerPrice,
} from "@autumn/shared";
import type { ApiPlanItemV1 } from "@autumn/shared/api/products/items/apiPlanItemV1.js";
import {
	customerEntitlementToFeatureId,
	customerEntitlementToPlanItemV1,
} from "@autumn/shared";

export type InternalPlanItemChange = {
	action: "created" | "deleted";
	feature_id: string;
	item: ApiPlanItemV1;
	previous_attributes: Record<string, unknown>;
};

export const buildInternalPlanItemChanges = ({
	customerProduct,
	insertCustomerEntitlements = [],
	deleteCustomerEntitlements = [],
	insertCustomerPrices = [],
	deleteCustomerPrices = [],
}: {
	customerProduct: FullCusProduct;
	insertCustomerEntitlements?: FullCustomerEntitlement[];
	deleteCustomerEntitlements?: FullCustomerEntitlement[];
	insertCustomerPrices?: FullCustomerPrice[];
	deleteCustomerPrices?: FullCustomerPrice[];
}): InternalPlanItemChange[] => [
	...insertCustomerEntitlements.map((customerEntitlement) => ({
		action: "created" as const,
		feature_id: customerEntitlementToFeatureId(customerEntitlement),
		item: customerEntitlementToPlanItemV1({
			customerEntitlement,
			customerProduct,
			customerPrices: insertCustomerPrices,
		}),
		previous_attributes: {},
	})),
	...deleteCustomerEntitlements.map((customerEntitlement) => ({
		action: "deleted" as const,
		feature_id: customerEntitlementToFeatureId(customerEntitlement),
		item: customerEntitlementToPlanItemV1({
			customerEntitlement,
			customerProduct,
			customerPrices: deleteCustomerPrices,
		}),
		previous_attributes: {},
	})),
];

export const buildPlanItemChanges = ({
	customerProduct,
	insertCustomerEntitlements,
	deleteCustomerEntitlements,
	insertCustomerPrices,
	deleteCustomerPrices,
}: {
	customerProduct: FullCusProduct;
	insertCustomerEntitlements?: FullCustomerEntitlement[];
	deleteCustomerEntitlements?: FullCustomerEntitlement[];
	insertCustomerPrices?: FullCustomerPrice[];
	deleteCustomerPrices?: FullCustomerPrice[];
}): CustomerPlanItemChange[] => {
	return buildInternalPlanItemChanges({
		customerProduct,
		insertCustomerEntitlements,
		deleteCustomerEntitlements,
		insertCustomerPrices,
		deleteCustomerPrices,
	}).map(({ action, feature_id, item }) => ({
		action,
		feature_id,
		item,
	}));
};
