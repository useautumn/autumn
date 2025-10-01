// import { zValidator } from "@hono/zod-validator";

import { ErrCode } from "@autumn/shared";
import type { Context } from "hono";
import type { HonoEnv } from "@/initHono.js";
import RecaseError from "@/utils/errorUtils.js";

export const handleCreateProduct = async (c: Context<HonoEnv>) => {
	const body1 = await c.req.json();
	const body2 = await c.req.json();
	console.log("Body1:", body1);
	console.log("Body2:", body2);
	const ctx = c.get("ctx");

	throw new RecaseError({
		message: "Test error",
		code: ErrCode.InvalidRequest,
		statusCode: 400,
	});

	// Get parsed body from context (already parsed by wrapExpressMiddleware)
	// const body = c.get("parsedBody");
	// console.log("Body:", body);

	// return c.json({ message: "Hello from Hono!", receivedBody: body });
};
