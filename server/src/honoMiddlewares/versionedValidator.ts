import {
	type AffectedResource,
	ApiVersionClass,
	applyRequestVersionChanges,
	LATEST_VERSION,
} from "@autumn/shared";
import { zValidator } from "@hono/zod-validator";
import type { MiddlewareHandler } from "hono";
import type { ZodType } from "zod/v4";
import { resolveVersionedEntry, type VersionedMap } from "./versionResolver.js";

export const versionedValidator = ({
	target,
	schemas,
	resource,
	transformToLatest = true,
}: {
	target: "json" | "query" | "param" | "header" | "form";
	schemas: VersionedMap<ZodType>;
	resource: AffectedResource;
	transformToLatest?: boolean;
}): MiddlewareHandler => {
	return async (c, next) => {
		const ctx = c.get("ctx");
		const userVersion = ctx.apiVersion;

		const schema = resolveVersionedEntry({
			map: schemas,
			requested: userVersion,
		});

		let validatedData: Record<string, unknown>;

		if (target === "query") {
			const parsedQuery = c.req.query();
			const result = schema.safeParse(parsedQuery);
			if (!result.success) {
				throw result.error;
			}
			validatedData = result.data as Record<string, unknown>;
			c.req.addValidatedData(target, validatedData);
		} else if (target === "json") {
			let rawBody: unknown;
			try {
				rawBody = await c.req.json();
			} catch {
				rawBody = {};
			}

			if (rawBody === null || rawBody === undefined) {
				rawBody = {};
			}

			const result = schema.safeParse(rawBody);
			if (!result.success) {
				throw result.error;
			}
			validatedData = result.data as Record<string, unknown>;
			c.req.addValidatedData(target, validatedData);
		} else {
			const validatorMiddleware = zValidator(target, schema, (result, _c) => {
				if (!result.success) {
					throw result.error;
				}
			});

			await validatorMiddleware(c, async () => {});

			validatedData = (c.req as any).valid(target) as Record<string, unknown>;
		}

		if (
			transformToLatest &&
			!userVersion.eq(new ApiVersionClass(LATEST_VERSION))
		) {
			const transformed = applyRequestVersionChanges({
				input: validatedData,
				fromVersion: userVersion,
				toVersion: new ApiVersionClass(LATEST_VERSION),
				resource,
				ctx,
			});

			c.req.addValidatedData(target, transformed);
		}

		await next();
	};
};
