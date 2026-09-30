import { z } from "zod/v4";
import { AppEnv } from "../../models/genModels/genEnums";
import { ByocCacheStatus } from "../../models/orgModels/byocConfig";

export const ByocCacheStatusSchema = z
	.enum([
		ByocCacheStatus.AwaitingSetup,
		ByocCacheStatus.Provisioning,
		ByocCacheStatus.Ready,
		ByocCacheStatus.Failed,
	])
	.describe(
		"`awaiting_setup` until the setup runs in your cloud, then `provisioning`, then `ready`.",
	);

export const ApiByocCacheSchema = z.object({
	env: z.enum(AppEnv).describe("The environment this cache serves."),
	status: ByocCacheStatusSchema,
	deployment_id: z
		.string()
		.nullable()
		.describe("The deployment in your cloud, once setup has created it."),
	endpoint_url: z
		.string()
		.nullable()
		.describe("Where the cache answers, once it is running."),
	created_at: z
		.number()
		.describe("When the cache was requested, ms since epoch."),
});

export const CreateByocCacheParamsSchema = z.object({});

export const CreateByocCacheResponseSchema = ApiByocCacheSchema.extend({
	setup_url: z
		.string()
		.nullable()
		.describe(
			"Where to run the setup in your cloud. Minted per call, so call again for a fresh link.",
		),
	token: z
		.string()
		.describe("Sent as `x-atom-token` on every request to the cache."),
});

export const GetByocCacheParamsSchema = z.object({});

export const GetByocCacheResponseSchema = z.object({
	cache: ApiByocCacheSchema.nullable(),
});

export const DeleteByocCacheParamsSchema = z.object({});

export type ApiByocCache = z.infer<typeof ApiByocCacheSchema>;
export type CreateByocCacheResponse = z.infer<
	typeof CreateByocCacheResponseSchema
>;
export type GetByocCacheResponse = z.infer<typeof GetByocCacheResponseSchema>;
