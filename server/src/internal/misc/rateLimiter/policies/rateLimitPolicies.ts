import { ApiVersion } from "@autumn/shared";
import { perMinute, perSecond, route } from "./rateLimitPolicyBuilders";
import type { RateLimitLayer } from "./types/rateLimitLayer";
import type { RateLimitPolicy } from "./types/rateLimitPolicy";

// Defaults: counted "allPods" (one Redis counter), overLimit "reject" (429).
// The org layer is checked first, then the customer layer; both must pass.

const TRACK_ROUTES = [
	route("POST /v1/balances.track"),
	route("POST /v1/balances.track_tokens"),
	route("POST /v1/balances.update"),
	route("POST /v1/balances.finalize"),
	route("POST /v1/track"),
	route("POST /v1/track_tokens"),
	route("POST /v1/events"),
	route("POST /v1/usage"),
	route("POST /v1/balances/update"),
];

const CHECK_ROUTES = [
	route("POST /v1/balances.check"),
	route("POST /v1/check"),
	route("POST /v1/entitled"),
];

const CUSTOMER_GET_ROUTES = [
	route("POST /v1/customers"),
	route("POST /v1/customers.get"),
	route("POST /v1/customers.get_or_create"),
	route("GET /v1/customers/:customer_id"),
	route("GET /v1/customers/:customer_id/entities/:entity_id"),
];

const CUSTOMER_LIST_ROUTES = [
	route("GET /v1/customers"),
	route("POST /v1/customers/list"),
	route("POST /v1/customers.list"),
];

// Previews, checkout and the customer portal stay on general.
const ATTACH_ROUTES = [
	route("POST /v1/attach"),
	route("POST /v1/cancel"),
	route("POST /v1/setup_payment"),
	route("POST /v1/billing.attach"),
	route("POST /v1/billing.multi_attach"),
	route("POST /v1/billing.update"),
	route("POST /v1/billing.setup_payment"),
	route("POST /v1/billing.sync"),
	route("POST /v1/billing.sync_v2"),
	route("POST /v1/billing.preview_sync_v2"),
	route("POST /v1/billing.sync_proposals"),
	route("POST /v1/billing.sync_proposals_v2"),
];

// Rows share a counter by sharing a layer name; perPod layers must share the object too.
const checkPerCustomer: RateLimitLayer = {
	name: "check",
	...perSecond(10_000),
	counted: "perPod",
};
const checkPerOrg: RateLimitLayer = {
	name: "check_org",
	...perMinute(240_000),
};

// 2.4 matches no upTo key, so it gets `otherwise` (5/s): open question for John.
const customerListPerOrg: RateLimitLayer = {
	name: "list_customers",
	...perSecond({
		upTo: { [ApiVersion.V2_2]: 5, [ApiVersion.V2_3]: 50 },
		otherwise: 5,
	}),
};

// First match wins; "general" catches every other route.
export const RATE_LIMIT_POLICIES: RateLimitPolicy[] = [
	{
		id: "track",
		routes: TRACK_ROUTES,
		perCustomer: { name: "track", ...perSecond(10_000), counted: "perPod" },
		perOrg: { name: "track_org", ...perMinute(120_000), overLimit: "degrade" },
	},
	{
		id: "batch_track",
		routes: [
			route("POST /v1/balances.batch_track"),
			route("POST /v1/balances.batch_track_tokens"),
		],
		perOrg: { name: "batch_track", ...perSecond(10) },
	},
	{
		id: "check",
		routes: CHECK_ROUTES,
		perCustomer: checkPerCustomer,
		perOrg: { ...checkPerOrg, overLimit: "degrade" },
	},
	{
		id: "customer_get",
		routes: CUSTOMER_GET_ROUTES,
		perCustomer: checkPerCustomer,
		// Same check_org counter as check, but over the cap these 429 (clients fail open).
		perOrg: { ...checkPerOrg, overLimit: "rejectAndQueueCreate" },
	},
	{
		id: "entity_get",
		routes: [route("POST /v1/entities.get")],
		perCustomer: { name: "customer_entities_get", ...perSecond(50) },
		perOrg: { name: "entities_get_org", ...perMinute(90_000) },
	},
	{
		id: "customer_list",
		routes: CUSTOMER_LIST_ROUTES,
		perOrg: customerListPerOrg,
	},
	{
		id: "entity_list",
		routes: [route("POST /v1/entities.list")],
		perCustomer: {
			name: "entities_list",
			...perSecond(10),
			skipWithoutCustomerId: true,
		},
		perOrg: customerListPerOrg,
	},
	{
		id: "events_query",
		routes: [
			route("POST /v1/events.list"),
			route("POST /v1/events.aggregate"),
			route("POST /v1/events/list"),
			route("POST /v1/events/aggregate"),
			route("POST /v1/query"),
		],
		perCustomer: { name: "events", ...perSecond(5) },
	},
	{
		id: "logs",
		routes: [route("POST /v1/logs.search"), route("POST /v1/logs.query")],
		perOrg: { name: "logs", ...perSecond(10) },
	},
	{
		id: "attach",
		routes: ATTACH_ROUTES,
		perCustomer: { name: "attach", ...perMinute(30) },
		skipForTestsOrg: true,
	},
	{
		id: "general",
		routes: "*",
		perOrg: {
			name: "general",
			...perSecond(process.env.NODE_ENV === "development" ? 1000 : 25),
		},
	},
];
