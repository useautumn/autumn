import type { ApiVersion } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { getLayerLimiter } from "@/internal/misc/rateLimiter/layerLimiter/getLayerLimiter.js";
import { getRateLimitKey } from "@/internal/misc/rateLimiter/policies/getRateLimitKey.js";
import { resolveLayerLimit } from "@/internal/misc/rateLimiter/policies/resolveLayerLimit.js";
import { resolveRateLimitPolicy } from "@/internal/misc/rateLimiter/policies/resolveRateLimitPolicy.js";
import type { RateLimitLayer } from "@/internal/misc/rateLimiter/policies/types/rateLimitLayer.js";
import type { RateLimitLayerScope } from "@/internal/misc/rateLimiter/policies/types/rateLimitLayerScope.js";
import {
	createGoldenCtx,
	type DescribeRateLimit,
	GOLDEN_CUSTOMER_ID,
	type GoldenLayer,
	type ListPerPodLimiters,
} from "./goldenRateLimitRequests.js";

const createPolicyCtx = ({
	apiVersion,
	customerId,
}: {
	apiVersion?: ApiVersion;
	customerId?: string;
}) => createGoldenCtx({ apiVersion, customerId }) as unknown as AutumnContext;

const describePolicyLayer = ({
	layer,
	scope,
	apiVersion,
}: {
	layer: RateLimitLayer;
	scope: RateLimitLayerScope;
	apiVersion?: ApiVersion;
}): GoldenLayer => ({
	scope,
	name: layer.name,
	overrideKey: layer.name,
	limit: resolveLayerLimit({ layer, apiVersion }).limit,
	windowMs: layer.windowMs,
	key: getRateLimitKey({
		ctx: createPolicyCtx({ apiVersion, customerId: GOLDEN_CUSTOMER_ID }),
		layer,
		scope,
	}),
	keyWithoutCustomerId: getRateLimitKey({
		ctx: createPolicyCtx({ apiVersion }),
		layer,
		scope,
	}),
	counted: layer.counted ?? "allPods",
	overLimit: layer.overLimit ?? "reject",
	runsWithoutCustomerId: !layer.skipWithoutCustomerId,
});

/** Resolves a request the way rateLimitMiddleware does with the policy table. */
export const describeRateLimitPolicy: DescribeRateLimit = ({
	route,
	apiVersion,
}) => {
	const policy = resolveRateLimitPolicy({
		method: route.method,
		path: route.path,
	});
	const layers: GoldenLayer[] = [];
	if (policy.perOrg) {
		layers.push(
			describePolicyLayer({
				layer: policy.perOrg,
				scope: "perOrg",
				apiVersion,
			}),
		);
	}
	if (policy.perCustomer) {
		layers.push(
			describePolicyLayer({
				layer: policy.perCustomer,
				scope: "perCustomer",
				apiVersion,
			}),
		);
	}
	return { skipsTestsOrg: policy.skipForTestsOrg === true, layers };
};

export const listPolicyPerPodLimiters: ListPerPodLimiters = ({ route }) => {
	const { perOrg, perCustomer } = resolveRateLimitPolicy({
		method: route.method,
		path: route.path,
	});
	const scopedLayers = [
		{ layer: perOrg, scope: "perOrg" as const },
		{ layer: perCustomer, scope: "perCustomer" as const },
	];
	return scopedLayers.flatMap(({ layer, scope }) =>
		layer?.counted === "perPod" ? [getLayerLimiter({ layer, scope })] : [],
	);
};
