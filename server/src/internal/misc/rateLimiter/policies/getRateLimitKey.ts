import type { ApiVersion } from "@autumn/shared";
import { resolveLayerLimit } from "./resolveLayerLimit";
import type { RateLimitLayer } from "./types/rateLimitLayer";
import type { RateLimitLayerScope } from "./types/rateLimitLayerScope";

type RateLimitKeyContext = {
	org?: { id: string };
	env: string;
	apiVersion?: { value: ApiVersion };
	customerId?: string;
};

/** `${name}:${orgId}:${env}[:v${version}][:${customerId}]` — live Redis counters depend on this shape. */
export const getRateLimitKey = ({
	ctx,
	layer,
	scope,
}: {
	ctx: RateLimitKeyContext;
	layer: RateLimitLayer;
	scope: RateLimitLayerScope;
}): string => {
	const { matchedVersion } = resolveLayerLimit({
		layer,
		apiVersion: ctx.apiVersion?.value,
	});
	const versionSuffix = matchedVersion ? `:v${matchedVersion}` : "";
	const orgKey = `${layer.name}:${ctx.org?.id}:${ctx.env}${versionSuffix}`;

	return scope === "perOrg" ? orgKey : `${orgKey}:${ctx.customerId}`;
};
