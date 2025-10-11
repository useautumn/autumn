import {
	AppEnv,
	type ProductItem,
	ProductItemInterval,
	type ProductV2,
} from "@autumn/shared";

// Create a stable default product outside component to prevent re-renders
export const DEFAULT_PRODUCT: ProductV2 = {
	id: "",
	name: "",
	items: [
		{
			price: "",
			interval: ProductItemInterval.Month,
		} as unknown as ProductItem,
	],
	archived: false,
	created_at: Date.now(),
	is_add_on: false,
	is_default: false,
	version: 1,
	group: "",
	env: AppEnv.Sandbox,
	internal_id: "",
};
