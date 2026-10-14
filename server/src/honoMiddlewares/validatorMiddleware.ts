import { zValidator } from "@hono/zod-validator";
import type { ZodType } from "zod/v4";

export const validator = <T extends ZodType>(
	target: "json" | "query" | "param" | "header" | "form",
	schema: T,
) => {
	if (target === "query") {
		return async (c: any, next: any) => {
			const parsedQuery = c.req.query();
			const result = schema.safeParse(parsedQuery);
			if (!result.success) {
				throw result.error;
			}
			c.req.addValidatedData(target, result.data);
			await next();
		};
	}

	if (target === "json") {
		return async (c: any, next: any) => {
			let body: unknown;
			try {
				body = await c.req.json();
			} catch {
				body = {};
			}

			if (body === null || body === undefined) {
				body = {};
			}

			const result = schema.safeParse(body);
			if (!result.success) {
				throw result.error;
			}
			c.req.addValidatedData(target, result.data);
			await next();
		};
	}

	return zValidator(target, schema, (result, _c) => {
		if (!result.success) {
			throw result.error;
		}
	});
};
