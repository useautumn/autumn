import { AppEnv, type FullCusProduct, type FullCustomer } from "@autumn/shared";

export const makeFullCustomer = ({
	id = "cus_test",
	customerProducts = [],
}: {
	id?: string;
	customerProducts?: FullCusProduct[];
} = {}): FullCustomer => {
	return {
		id,
		internal_id: `internal_${id}`,
		org_id: "org_test",
		created_at: 1_700_000_000_000,
		env: AppEnv.Sandbox,
		processor: null,
		customer_products: customerProducts,
		entities: [],
	} as unknown as FullCustomer;
};
