import {
	type FullProduct,
	type ProductKey,
	productKeyToString,
} from "@autumn/shared";
import type { ProductStatesContext } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";
import {
	type CustomerProductVersioningFlags,
	emptyVersioningFlags,
} from "@/internal/customers/cusProducts/repos/getVersioningUsage.js";

export type ProductKeyState = {
	currentFullProduct: FullProduct | null;
	customerUsage: CustomerProductVersioningFlags;
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
			customerUsage: emptyVersioningFlags(),
		};
	}

	return {
		currentFullProduct: state.currentFullProduct,
		customerUsage: state.customerUsage,
	};
};
