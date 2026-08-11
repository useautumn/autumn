import {
	type FullProduct,
	type ProductKey,
	productKeyToString,
} from "@autumn/shared";
import type { ProductStatesContext } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";
import type { CustomerProductVersioningUsage } from "@/internal/customers/cusProducts/repos/getVersioningUsage.js";

const emptyCustomerUsage = (): CustomerProductVersioningUsage => ({
	hasAnyCustomerProducts: false,
	hasVersionableCustomerProducts: false,
	versionableCustomerCount: 0,
});

export type ProductKeyState = {
	currentFullProduct: FullProduct | null;
	customerUsage: CustomerProductVersioningUsage;
};

/** Lookup one productKey in productStatesContext; missing → create baseline. */
export const productKeyToState = ({
	productKey,
	productStatesContext,
}: {
	productKey: ProductKey;
	productStatesContext: ProductStatesContext;
}): ProductKeyState => {
	const state =
		productStatesContext.statesByPlanVersion[
			productKeyToString({ productKey })
		];

	if (!state) {
		return {
			currentFullProduct: null,
			customerUsage: emptyCustomerUsage(),
		};
	}

	return {
		currentFullProduct: state.currentFullProduct,
		customerUsage: state.customerUsage,
	};
};
