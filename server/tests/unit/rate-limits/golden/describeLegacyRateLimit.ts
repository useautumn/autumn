import type { ApiVersion } from "@autumn/shared";
import type { Context } from "hono";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import {
	getOrgAggregateType,
	getRateLimitType,
	isCheckFailOpenRoute,
	RATE_LIMIT_CONFIGS,
	RateLimitScope,
	RateLimitType,
	resolveRateLimit,
} from "@/internal/misc/rateLimiter/rateLimitConfigs.js";
import { getRateLimitKey } from "@/internal/misc/rateLimiter/rateLimitFactory.js";
import {
	createGoldenCtx,
	type DescribeRateLimit,
	GOLDEN_CUSTOMER_ID,
	type GoldenLayer,
	type GoldenRoute,
} from "./goldenRateLimitRequests.js";

const createLegacyContext = ({
	route,
	apiVersion,
	customerId,
}: {
	route: GoldenRoute;
	apiVersion?: ApiVersion;
	customerId?: string;
}) =>
	({
		req: { method: route.method, path: route.path },
		get: () => createGoldenCtx({ apiVersion, customerId }),
	}) as unknown as Context<HonoEnv>;

const describeLegacyLayer = ({
	route,
	apiVersion,
	type,
	scope,
	runsWithoutCustomerId,
}: {
	route: GoldenRoute;
	apiVersion?: ApiVersion;
	type: RateLimitType;
	scope: GoldenLayer["scope"];
	runsWithoutCustomerId: boolean;
}): GoldenLayer => {
	const config = RATE_LIMIT_CONFIGS[type];
	const withCustomer = createLegacyContext({
		route,
		apiVersion,
		customerId: GOLDEN_CUSTOMER_ID,
	});
	const withoutCustomer = createLegacyContext({ route, apiVersion });
	const queuesCreate =
		type === RateLimitType.CheckOrg && !isCheckFailOpenRoute(withCustomer);

	return {
		scope,
		name: config.name,
		overrideKey: type,
		limit: resolveRateLimit({ config, apiVersion }).limit,
		windowMs: config.windowMs,
		key: getRateLimitKey({ c: withCustomer, rateLimitType: type }),
		keyWithoutCustomerId: getRateLimitKey({
			c: withoutCustomer,
			rateLimitType: type,
		}),
		counted: config.notInRedis ? "perPod" : "allPods",
		overLimit:
			config.overLimit !== "degrade"
				? "reject"
				: queuesCreate
					? "rejectAndQueueCreate"
					: "degrade",
		runsWithoutCustomerId,
	};
};

/** Resolves a request the way rateLimitMiddleware did before the policy table. */
export const describeLegacyRateLimit: DescribeRateLimit = ({
	route,
	apiVersion,
}) => {
	const type = getRateLimitType(createLegacyContext({ route, apiVersion }));
	const aggregateType = getOrgAggregateType(type);
	const skipsTestsOrg = type === RateLimitType.Attach;

	if (!aggregateType) {
		const isOrgScoped = RATE_LIMIT_CONFIGS[type].scope === RateLimitScope.Org;
		return {
			skipsTestsOrg,
			layers: [
				describeLegacyLayer({
					route,
					apiVersion,
					type,
					scope: isOrgScoped ? "perOrg" : "perCustomer",
					runsWithoutCustomerId: true,
				}),
			],
		};
	}

	return {
		skipsTestsOrg,
		layers: [
			describeLegacyLayer({
				route,
				apiVersion,
				type: aggregateType,
				scope: "perOrg",
				runsWithoutCustomerId: true,
			}),
			describeLegacyLayer({
				route,
				apiVersion,
				type,
				scope: "perCustomer",
				runsWithoutCustomerId: type !== RateLimitType.EntitiesList,
			}),
		],
	};
};
