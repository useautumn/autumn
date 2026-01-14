import type {
	FrontendProduct,
	FullCusProduct,
	ProductV2,
} from "@autumn/shared";
import type { PrepaidItemWithFeature } from "@/hooks/stores/useProductStore";

export interface UpdateSubscriptionFormContext {
	customerId: string | undefined;
	product: ProductV2 | FrontendProduct | undefined;
	entityId: string | undefined;
	customerProduct: FullCusProduct;
	customizedProduct: FrontendProduct | undefined;
	prepaidItems: PrepaidItemWithFeature[];
}
