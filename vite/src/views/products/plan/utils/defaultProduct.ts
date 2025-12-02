import type { FrontendProduct } from "@autumn/shared";
import { AppEnv } from "@autumn/shared";

// Create a stable default product outside component to prevent re-renders
export const DEFAULT_PRODUCT: FrontendProduct = {
	id: "",
	name: "",
	items: [
		// {
		// 	price: "",
		// 	interval: "",
		// } as unknown as ProductItem,
	],
	archived: false,
	created_at: Date.now(),
	is_add_on: false,
	is_default: false,
	version: 1,
	group: null,
	env: AppEnv.Sandbox,
	internal_id: "",

	planType: null,
	basePriceType: "recurring",
};
