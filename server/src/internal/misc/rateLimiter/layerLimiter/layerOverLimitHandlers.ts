import type { Context, Next } from "hono";
import { logger } from "@/external/logtail/logtailUtils.js";
import type { HonoEnv } from "@/honoUtils/HonoEnv";
import { queueRateLimitedCustomerCreation } from "@/internal/customers/recovery/queueRateLimitedCustomerCreation.js";
import type { RateLimitLayer } from "../policies/types/rateLimitLayer";

type OverLimitHandler = (
	c: Context,
	next: Next,
) => Promise<Response | undefined>;

const CAP_EXCEEDED_WARNING_INTERVAL_MS = 10_000;
const lastCapWarnAtByLayerName = new Map<string, number>();

const warnOrgCapExceeded = ({
	layerName,
	orgSlug,
}: {
	layerName: string;
	orgSlug?: string;
}) => {
	const now = Date.now();
	const lastWarnAt = lastCapWarnAtByLayerName.get(layerName) ?? 0;
	if (now - lastWarnAt < CAP_EXCEEDED_WARNING_INTERVAL_MS) return;

	lastCapWarnAtByLayerName.set(layerName, now);
	logger.warn(
		`[rate-limit] org aggregate cap exceeded: ${orgSlug ?? "unknown"} (${layerName})`,
		{ type: "org_rate_cap_exceeded", limitType: layerName, org: orgSlug },
	);
};

/** Serves the request anyway; check fails open and track queues through SQS. */
const createDegradeHandler =
	({ layer }: { layer: RateLimitLayer }): OverLimitHandler =>
	async (c, next) => {
		const ctx = (c as Context<HonoEnv>).get("ctx");
		warnOrgCapExceeded({ layerName: layer.name, orgSlug: ctx?.org?.slug });

		if (ctx) ctx.orgRateLimitDegraded = true;
		c.header("Retry-After", undefined);
		await next();
		return;
	};

/** Clients fail open on this 429; valid creates are queued for serialized replay. */
const createRejectAndQueueCreateHandler =
	({ layer }: { layer: RateLimitLayer }): OverLimitHandler =>
	async (c) => {
		const honoContext = c as Context<HonoEnv>;
		const ctx = honoContext.get("ctx");
		warnOrgCapExceeded({ layerName: layer.name, orgSlug: ctx?.org?.slug });

		await queueRateLimitedCustomerCreation({ c: honoContext });
		c.header("Retry-After", undefined);
		return c.json(
			{
				message: "Rate limit exceeded.",
				code: "rate_limit_exceeded",
				env: ctx?.env,
			},
			429,
		);
	};

/** undefined keeps hono-rate-limiter's default 429. */
export const getLayerOverLimitHandler = ({
	layer,
}: {
	layer: RateLimitLayer;
}): OverLimitHandler | undefined => {
	if (layer.overLimit === "degrade") return createDegradeHandler({ layer });
	if (layer.overLimit === "rejectAndQueueCreate") {
		return createRejectAndQueueCreateHandler({ layer });
	}
	return undefined;
};
