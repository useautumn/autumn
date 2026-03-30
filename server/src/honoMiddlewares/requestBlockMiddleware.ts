import { ErrCode, RecaseError } from "@autumn/shared";
import type { Context, Next } from "hono";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import { matchRoute } from "./middlewareUtils.js";
import { getRuntimeRequestBlockEntry } from "@/internal/requestBlocks/requestBlockStore.js";

export const requestBlockMiddleware = async (
	c: Context<HonoEnv>,
	next: Next,
) => {
	const ctx = c.get("ctx");
	const orgId = ctx.org?.id;

	if (!orgId) {
		await next();
		return;
	}

	const entry = getRuntimeRequestBlockEntry(orgId);
	if (!entry) {
		await next();
		return;
	}

	if (entry.blockAll) {
		ctx.logger.warn("Rejecting blocked /v1 request", {
			orgId,
			orgSlug: ctx.org?.slug,
			method: c.req.method,
			path: c.req.path,
			blockAll: true,
		});

		throw new RecaseError({
			message: "API access is temporarily disabled for this organization",
			code: ErrCode.RequestTemporarilyDisabled,
			statusCode: 503,
		});
	}

	const matchedRule = entry.blockedEndpoints.find((rule) =>
		matchRoute({
			url: c.req.path,
			method: c.req.method,
			pattern: {
				url: rule.pattern,
				method: rule.method,
			},
		}),
	);

	if (!matchedRule) {
		await next();
		return;
	}

	ctx.logger.warn("Rejecting endpoint-blocked /v1 request", {
		orgId,
		orgSlug: ctx.org?.slug,
		method: c.req.method,
		path: c.req.path,
		rule: matchedRule,
	});

	throw new RecaseError({
		message: "This endpoint is temporarily disabled for this organization",
		code: ErrCode.RequestTemporarilyDisabled,
		statusCode: 503,
	});
};
