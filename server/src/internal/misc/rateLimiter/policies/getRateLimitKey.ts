import type { ApiVersion } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { resolveLayerLimit } from "./resolveLayerLimit";
import type { RateLimitLayer } from "./types/rateLimitLayer";
import type { RateLimitLayerScope } from "./types/rateLimitLayerScope";

/** `${name}:${orgId}:${env}[:v${version}][:${customerId}]` — live Redis counters depend on this shape. */
export const getRateLimitKey = ({
	ctx,
	layer,
	scope,
}: {
	ctx: Pick<AutumnContext, "org" | "env" | "apiVersion" | "customerId">;
	layer: RateLimitLayer;
	scope: RateLimitLayerScope;
}): string => {
	const apiVersion = ctx.apiVersion?.value as ApiVersion | undefined;
	const { matchedVersion } = resolveLayerLimit({ layer, apiVersion });
	const versionSuffix = matchedVersion ? `:v${matchedVersion}` : "";
	const orgKey = `${layer.name}:${ctx.org?.id}:${ctx.env}${versionSuffix}`;

	return scope === "perOrg" ? orgKey : `${orgKey}:${ctx.customerId}`;
};
