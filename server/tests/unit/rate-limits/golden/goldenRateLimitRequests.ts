import { API_VERSIONS, type ApiVersion } from "@autumn/shared";

export type GoldenRoute = { method: string; path: string };

export type GoldenLayer = {
	scope: "perOrg" | "perCustomer";
	name: string;
	overrideKey: string;
	limit: number | string;
	windowMs: number;
	key: string;
	keyWithoutCustomerId: string;
	counted: "allPods" | "perPod";
	overLimit: "reject" | "degrade" | "rejectAndQueueCreate";
	runsWithoutCustomerId: boolean;
};

export type GoldenResolution = {
	skipsTestsOrg: boolean;
	layers: GoldenLayer[];
};

export type DescribeRateLimit = (params: {
	route: GoldenRoute;
	apiVersion?: ApiVersion;
}) => GoldenResolution;

const route = (spec: string): GoldenRoute => {
	const [method, path] = spec.split(" ");
	return { method, path };
};

// Every route in the rate-limit table plus routes that must fall back to general.
export const GOLDEN_ROUTES: GoldenRoute[] = [
	route("POST /v1/cancel"),
	route("POST /v1/setup_payment"),
	route("POST /v1/attach"),
	route("POST /v1/billing.attach"),
	route("POST /v1/billing.multi_attach"),
	route("POST /v1/billing.update"),
	route("POST /v1/billing.setup_payment"),
	route("POST /v1/billing.sync_proposals"),
	route("POST /v1/billing.sync_proposals_v2"),
	route("POST /v1/billing.sync"),
	route("POST /v1/billing.sync_v2"),
	route("POST /v1/billing.preview_sync_v2"),
	route("GET /v1/customers"),
	route("POST /v1/customers/list"),
	route("POST /v1/customers.list"),
	route("POST /v1/entities.list"),
	route("POST /v1/events/list"),
	route("POST /v1/events/aggregate"),
	route("POST /v1/query"),
	route("POST /v1/events.list"),
	route("POST /v1/events.aggregate"),
	route("POST /v1/events"),
	route("POST /v1/track"),
	route("POST /v1/track_tokens"),
	route("POST /v1/usage"),
	route("POST /v1/balances/update"),
	route("POST /v1/balances.track"),
	route("POST /v1/balances.track_tokens"),
	route("POST /v1/balances.finalize"),
	route("POST /v1/balances.update"),
	route("POST /v1/balances.batch_track"),
	route("POST /v1/balances.batch_track_tokens"),
	route("POST /v1/check"),
	route("POST /v1/entitled"),
	route("POST /v1/balances.check"),
	route("GET /v1/customers/cus_golden"),
	route("GET /v1/customers/cus_golden/entities/ent_golden"),
	route("POST /v1/customers"),
	route("POST /v1/customers.get"),
	route("POST /v1/customers.get_or_create"),
	route("POST /v1/entities.get"),
	route("POST /v1/logs.search"),
	route("POST /v1/logs.query"),
	route("POST /v1/checkout"),
	route("POST /v1/attach/preview"),
	route("POST /v1/billing.preview_update"),
	route("POST /v1/billing.preview_multi_attach"),
	route("POST /v1/billing.preview_attach"),
	route("POST /v1/billing.open_customer_portal"),
	route("GET /v1/products"),
	route("GET /v1/customers/cus_golden/events"),
	route("GET /v1/check"),
];

export const GOLDEN_VERSIONS: (ApiVersion | undefined)[] = [
	...API_VERSIONS,
	undefined,
];

export const GOLDEN_CUSTOMER_ID = "cus_golden";

export const createGoldenCtx = ({
	apiVersion,
	customerId,
}: {
	apiVersion?: ApiVersion;
	customerId?: string;
}) => ({
	org: { id: "org_golden", slug: "golden" },
	env: "live",
	apiVersion: apiVersion ? { value: apiVersion } : undefined,
	customerId,
});

// general reads NODE_ENV when the policy module loads; unit shards import it under either value.
export const toEnvironmentStableLimit = ({
	name,
	limit,
}: {
	name: string;
	limit: number | string;
}) => {
	if (name !== "general") return limit;
	if (limit !== 25 && limit !== 1000) {
		throw new Error(`unexpected general limit ${limit}`);
	}
	return "25 (1000 in development)";
};

const toEnvironmentStableResolution = (
	resolution: GoldenResolution,
): GoldenResolution => ({
	...resolution,
	layers: resolution.layers.map((layer) => ({
		...layer,
		limit: toEnvironmentStableLimit(layer),
	})),
});

const groupVersionsByResolution = ({
	goldenRoute,
	describeRateLimit,
}: {
	goldenRoute: GoldenRoute;
	describeRateLimit: DescribeRateLimit;
}) => {
	const groups = new Map<
		string,
		{ versions: string[]; resolution: GoldenResolution }
	>();
	for (const apiVersion of GOLDEN_VERSIONS) {
		const resolution = toEnvironmentStableResolution(
			describeRateLimit({ route: goldenRoute, apiVersion }),
		);
		const serialized = JSON.stringify(resolution);
		const group = groups.get(serialized) ?? { versions: [], resolution };
		group.versions.push(apiVersion ?? "none");
		groups.set(serialized, group);
	}
	return [...groups.values()].map(({ versions, resolution }) => ({
		versions: versions.join(", "),
		...resolution,
	}));
};

/** Versions that resolve identically share one entry so the snapshot stays readable. */
export const describeAllGoldenRoutes = ({
	describeRateLimit,
}: {
	describeRateLimit: DescribeRateLimit;
}) =>
	Object.fromEntries(
		GOLDEN_ROUTES.map((goldenRoute) => [
			`${goldenRoute.method} ${goldenRoute.path}`,
			groupVersionsByResolution({ goldenRoute, describeRateLimit }),
		]),
	);
