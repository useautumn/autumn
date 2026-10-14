import type { Tinybird } from "@chronark/zod-bird";
import { z } from "../tinybirdZod.js";

export const propertyKeyExistsPipeResponseSchema = z.object({
	key_exists: z.number(),
});

export type PropertyKeyExistsPipeRow = z.infer<
	typeof propertyKeyExistsPipeResponseSchema
>;

export const propertyKeyExistsPipeParamsSchema = z.object({
	org_id: z.string(),
	env: z.string(),
	property_key: z.string(),
});

export type PropertyKeyExistsPipeParams = z.infer<
	typeof propertyKeyExistsPipeParamsSchema
>;

export const createPropertyKeyExistsPipe = (tb: Tinybird) =>
	tb.buildPipe({
		pipe: "property_key_exists",
		parameters: propertyKeyExistsPipeParamsSchema,
		data: propertyKeyExistsPipeResponseSchema,
	});
