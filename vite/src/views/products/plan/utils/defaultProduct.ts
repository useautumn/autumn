import type { FrontendProduct } from "@autumn/shared";
import { AppEnv } from "@autumn/shared";

export const DEFAULT_PRODUCT: FrontendProduct = {
	id: "",
	name: "",
	items: [],
	archived: false,
	created_at: Date.now(),
	is_add_on: false,
	is_default: false,
	version: 1,
	version_slug: "v1",
	active: true,
	group: null,
	env: AppEnv.Sandbox,
	internal_id: "",

	planType: null,
	basePriceType: "recurring",
};
