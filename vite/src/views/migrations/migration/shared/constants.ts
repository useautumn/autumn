import { BillingInterval, BillingMethod } from "@autumn/shared";

export const INTERVAL_OPTIONS = Object.values(BillingInterval).map((v) => ({
	value: v,
	label: v,
}));

export const BILLING_METHOD_OPTIONS = Object.values(BillingMethod).map((v) => ({
	value: v,
	label: v,
}));
