import type { RateLimitLayerSummary } from "./rateLimitLayerSummary";

export type RateLimitPolicyOverride = {
	orgKey: string;
	perOrg?: number;
	perCustomer?: number;
};

export type RateLimitPolicySummary = {
	id: string;
	type: string;
	routes: string[] | "*";
	perOrg: RateLimitLayerSummary | null;
	perCustomer: RateLimitLayerSummary | null;
	sharesCounterWith: string[];
	overrides: RateLimitPolicyOverride[];
};
