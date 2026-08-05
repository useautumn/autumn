import { z } from "zod/v4";

export const RequestBlockMethodSchema = z.enum([
	"GET",
	"POST",
	"PUT",
	"PATCH",
	"DELETE",
	"OPTIONS",
	"HEAD",
]);

export const RequestBlockRuleSchema = z.object({
	method: RequestBlockMethodSchema,
	pattern: z
		.string()
		.min(1)
		.refine((value) => value.startsWith("/v1/"), {
			message: "Blocked endpoint patterns must start with /v1/",
		}),
});

export const RequestBlockEntrySchema = z.object({
	blockAll: z.boolean().default(false),
	blockedEndpoints: z.array(RequestBlockRuleSchema).default([]),
	updatedAt: z.string(),
	updatedBy: z.string().optional(),
});

export const RequestBlockConfigSchema = z.object({
	orgs: z.record(z.string(), RequestBlockEntrySchema).default({}),
});

export const RequestBlockUpdateSchema = z.object({
	blockAll: z.boolean(),
	blockedEndpoints: z.array(RequestBlockRuleSchema),
});

export type RequestBlockRule = z.infer<typeof RequestBlockRuleSchema>;
export type RequestBlockEntry = z.infer<typeof RequestBlockEntrySchema>;
export type RequestBlockConfig = z.infer<typeof RequestBlockConfigSchema>;
export type RequestBlockUpdate = z.infer<typeof RequestBlockUpdateSchema>;
