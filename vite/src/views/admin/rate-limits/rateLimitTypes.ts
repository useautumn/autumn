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

/** An extra cap on one endpoint for one org; a limit of 0 blocks it. */
export type RateLimitEndpointOverride = { limit: number; windowMs: number };

/** Keyed by org, then by layer name (`limits`) or `METHOD /v1/path` (`endpoints`). */
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
	/** Every `METHOD /v1/path` the API serves. */
	knownEndpoints: string[];
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

/** One endpoint and every org that caps it. */
export type RateLimitEndpointPolicy = {
	endpoint: string;
	overrides: ({ orgKey: string } & RateLimitEndpointOverride)[];
};
