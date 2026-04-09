import { ErrCode, RecaseError } from "@autumn/shared";
import type { Context, Next } from "hono";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import { isRuntimeCustomerBlocked } from "@/internal/misc/customerBlocks/customerBlockStore.js";
import { logRequestResult } from "./requestLogging/logRequestResult.js";

export const customerBlockMiddleware = async (
	c: Context<HonoEnv>,
	next: Next,
) => {
	const ctx = c.get("ctx");
	const orgId = ctx.org?.id;
	const orgSlug = ctx.org?.slug;
	const customerId = ctx.customerId;

	if (!orgId || !customerId) {
		await next();
		return;
	}

	const isBlocked = isRuntimeCustomerBlocked({
		orgId,
		orgSlug,
		env: ctx.env,
		customerId,
	});

	if (!isBlocked) {
		await next();
		return;
	}

	await logRequestResult({
		ctx,
		c,
		statusCode: 403,
		responseBody: {
			message: "API access is temporarily disabled for this customer",
			code: ErrCode.RequestTemporarilyDisabled,
			env: ctx.env,
		},
	});

	throw new RecaseError({
		message: "API access is temporarily disabled for this customer",
		code: ErrCode.RequestTemporarilyDisabled,
		statusCode: 403,
	});
};
