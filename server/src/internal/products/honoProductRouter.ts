// import { zValidator } from "@hono/zod-validator";

import { ProductNotFoundError } from "@autumn/shared";
import type { Context } from "hono";
import { createStripeCli } from "@/external/stripe/utils.js";
import type { HonoEnv } from "@/initHono.js";

export const handleCreateProduct = async (c: Context<HonoEnv>) => {
	const body1 = await c.req.json();
	const body2 = await c.req.json();

	const ctx = c.get("ctx");
	const { org, env } = ctx;

	const stripe = createStripeCli({ org, env });

	try {
		const product = await stripe.products.retrieve("123");
	} catch (error: any) {
		console.log(error.message, error.code);
	}

	throw new ProductNotFoundError({ productId: "123" });
	// return c.json({ message: "Hello from Hono!" });

	// throw new ProductNotFoundError({ productId: "123" });

	// Get parsed body from context (already parsed by wrapExpressMiddleware)
	// const body = c.get("parsedBody");
	// console.log("Body:", body);

	// return c.json({ message: "Hello from Hono!", receivedBody: body });
};
