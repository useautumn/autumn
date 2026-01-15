import type { FullCusProduct, ProductV2 } from "@autumn/shared";
import type { PrepaidItemWithFeature } from "@/hooks/stores/useProductStore";

export interface UpdateSubscriptionFormContext {
	customerId: string | undefined;
	product: ProductV2 | undefined;
	entityId: string | undefined;
	customerProduct: FullCusProduct;
	prepaidItems: PrepaidItemWithFeature[];
	numVersions: number;
	currentVersion: number;
}
