import type { AppEnv, Price } from "@autumn/shared";

export type StripeReuseProductRef = {
	id: string;
	org_id: string;
	env: AppEnv;
};

export type StripeReuseCandidate = {
	price: Price;
	product: StripeReuseProductRef;
};
