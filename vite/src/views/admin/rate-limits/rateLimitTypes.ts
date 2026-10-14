export type RateLimitScope = "perOrg" | "perCustomer";

export type RateLimitLayerSummary = {
	name: string;
	limit: number;
	versionLimits: { upTo: string; limit: number; key: string }[];
	windowMs: number;
	store: "memory" | "redis";
	overLimit: "reject" | "degrade";
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
	perOrg: RateLimitLayerSummary | null;
	perCustomer: RateLimitLayerSummary | null;
	sharesCounterWith: string[];
	overrides: RateLimitPolicyOverride[];
};

export type RateLimitEndpointOverride = { limit: number; windowMs: number };

export type RateLimitOverrideLimits = Record<
	string,
	{
		limits: Record<string, number>;
		endpoints?: Record<string, RateLimitEndpointOverride>;
	}
>;

export type RateLimitOverridesView = {
	orgs: RateLimitOverrideLimits;
	policies: RateLimitPolicySummary[];
	knownEndpoints: string[];
	orgsByKey: Record<string, { id: string; name: string; slug: string }>;
	configHealthy: boolean;
	configConfigured: boolean;
	lastSuccessAt: string | null;
	error: string | null;
};

export type RateLimitOrg = {
	key: string;
	id: string;
	name: string;
	slug: string;
	overrideCount: number;
};

export type RateLimitEndpointPolicy = {
	endpoint: string;
	overrides: ({ orgKey: string } & RateLimitEndpointOverride)[];
};
