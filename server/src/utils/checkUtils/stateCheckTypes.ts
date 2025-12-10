import type { AppEnv } from "@autumn/shared";

export type SubItemDetail = {
	priceId: string;
	quantity: number;
	productName?: string;
	priceName?: string;
};

export type StateCheckResult = {
	passed: boolean;
	errors: string[];
	warnings: string[];
	checks: {
		name: string;
		type:
			| "subscription_correctness"
			| "customer_product_correctness"
			| "sub_id_matching"
			| "sub_count_match"
			| "group_uniqueness"
			| "entitlement_price_correctness"
			| "overall_status";
		passed: boolean;
		message?: string;
		data?: unknown;
	}[];
	// Detailed sub info when there's a mismatch
	subscriptionDetails?: {
		subId: string;
		actualItems: SubItemDetail[];
		expectedItems: SubItemDetail[];
	};
};

export type RedisChecksState = {
	status: "new" | "ongoing" | "archived";
	customer: {
		id: string;
		email: string;
		name: string;
		env: AppEnv;
		processor?: string;
	};
	org_id: string;
	env: AppEnv;
	checks: {
		type: Exclude<StateCheckResult["checks"][number]["type"], "overall_status">;
		passed: boolean;
		message: string;
		data?: unknown;
	}[];
};
