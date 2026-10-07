export type RateLimitScope = "perOrg" | "perCustomer";

export type RateLimitLayerSummary = {
	name: string;
	limit: number;
	versionLimits: { upTo: string; limit: number }[];
	windowMs: number;
	counted: "allPods" | "perPod";
	overLimit: "reject" | "degrade" | "rejectAndQueueCreate";
	skipWithoutCustomerId: boolean;
	key: string;
};

export type RateLimitPolicyOverride = {
	orgKey: string;
	perOrg?: number;
	perCustomer?: number;
};

export type RateLimitPolicySummary = {
	id: string;
	routes: string[] | "*";
	/** Version- or body-specific rows; they nest under the plain row with the same routes. */
	when?: { minVersion?: string; body?: Record<string, unknown> } | null;
	perOrg: RateLimitLayerSummary | null;
	perCustomer: RateLimitLayerSummary | null;
	sharesCounterWith: string[];
	overrides: RateLimitPolicyOverride[];
};

export type RateLimitOverrideLimits = Record<
	string,
	{ limits: Record<string, number> }
>;

export type RateLimitOverridesView = {
	orgs: RateLimitOverrideLimits;
	policies: RateLimitPolicySummary[];
	orgsByKey: Record<string, { id: string; name: string; slug: string }>;
	configHealthy: boolean;
	configConfigured: boolean;
	lastSuccessAt: string | null;
	error: string | null;
};

/** An org as the page picks it; `key` is what its overrides are stored under. */
export type RateLimitOrg = {
	key: string;
	id: string;
	name: string;
	slug: string;
	overrideCount: number;
};
