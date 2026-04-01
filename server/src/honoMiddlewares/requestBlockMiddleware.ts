import { ErrCode, RecaseError } from "@autumn/shared";
import type { Context, Next } from "hono";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import { getRuntimeRequestBlockEntry } from "@/internal/misc/requestBlocks/requestBlockStore.js";
import { matchRoute } from "./middlewareUtils.js";

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

	console.log("Entry:", entry);

	if (entry.blockAll) {
		ctx.logger.warn("Rejecting blocked /v1 request (block all)");

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

	ctx.logger.warn(
		"Rejecting endpoint-blocked /v1 request (blocked endpoint, matched rule)",
	);

	throw new RecaseError({
		message: "This endpoint is temporarily disabled for this organization",
		code: ErrCode.RequestTemporarilyDisabled,
		statusCode: 503,
	});
};
