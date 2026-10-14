import type { ZodType, z } from "zod/v4";
import type { SharedContext } from "../../../types/sharedContext.js";
import type { ApiVersion } from "../ApiVersion.js";

export enum AffectedResource {
	Customer = "customer",
	Entity = "entity",
	CusProduct = "cus_product",
	CusFeature = "cus_feature",
	CusBalance = "cus_balance",
	Invoice = "invoice",
	Product = "product",
	Feature = "feature",
	Check = "check",
	Track = "track",
	TrackTokens = "track_tokens",
	BatchTrack = "batch_track",
	BatchTrackTokens = "batch_track_tokens",
	Checkout = "checkout",
	Attach = "attach",
	MultiAttach = "multi_attach",
	ApiSubscriptionUpdate = "api_subscription_update",
	EventsAggregate = "events_aggregate",
	Event = "event",
	Coupon = "coupon",
	FeatureGrant = "feature_grant",
}

export abstract class VersionChange<
	TNewSchema extends ZodType = ZodType,
	TOldSchema extends ZodType = ZodType,
	TLegacyDataSchema extends ZodType = ZodType,
> {
	readonly name?: string;

	abstract readonly newVersion: ApiVersion;

	abstract readonly oldVersion: ApiVersion;

	abstract readonly description: string | string[];

	abstract readonly affectedResources: AffectedResource[];

	abstract readonly newSchema: TNewSchema;

	abstract readonly oldSchema: TOldSchema;

	readonly legacyDataSchema?: TLegacyDataSchema;

	readonly affectsRequest: boolean = false;

	readonly affectsResponse: boolean = true;

	readonly hasSideEffects: boolean = false;

	transformRequest({
		input,
		legacyData: _legacyData,
		ctx: _ctx,
	}: {
		input: z.infer<TOldSchema>;
		legacyData?: TLegacyDataSchema extends ZodType
			? z.infer<TLegacyDataSchema>
			: never;
		ctx?: SharedContext;
	}): z.infer<TNewSchema> {
		return input as unknown as z.infer<TNewSchema>;
	}

	transformResponse({
		input,
		legacyData: _legacyData,
		ctx: _ctx,
	}: {
		input: z.infer<TNewSchema>;
		legacyData?: TLegacyDataSchema extends ZodType
			? z.infer<TLegacyDataSchema>
			: never;
		ctx?: SharedContext;
	}): z.infer<TOldSchema> {
		return input as unknown as z.infer<TOldSchema>;
	}

	affects(resource: AffectedResource): boolean {
		return this.affectedResources.includes(resource);
	}
}

export type VersionChangeConstructor = new () => VersionChange<
	ZodType,
	ZodType,
	ZodType
>;

export interface VersionChangeConfig<
	TNewSchema extends ZodType = ZodType,
	TOldSchema extends ZodType = ZodType,
	TLegacyDataSchema extends ZodType = ZodType,
> {
	name?: string;

	newVersion: ApiVersion;

	oldVersion: ApiVersion;

	description: string | string[];

	affectedResources: AffectedResource[];

	newSchema: TNewSchema;

	oldSchema: TOldSchema;

	legacyDataSchema?: TLegacyDataSchema;

	affectsRequest?: boolean;

	affectsResponse?: boolean;

	hasSideEffects?: boolean;

	transformRequest?: (params: {
		input: z.infer<TOldSchema>;
		legacyData?: TLegacyDataSchema extends ZodType
			? z.infer<TLegacyDataSchema>
			: never;
		ctx: SharedContext;
	}) => z.infer<TNewSchema>;

	transformResponse?: (params: {
		input: z.infer<TNewSchema>;
		legacyData?: TLegacyDataSchema extends ZodType
			? z.infer<TLegacyDataSchema>
			: never;
		ctx: SharedContext;
	}) => z.infer<TOldSchema>;
}

export function defineVersionChange<
	TNewSchema extends ZodType,
	TOldSchema extends ZodType,
	TLegacyDataSchema extends ZodType = ZodType,
>(
	config: VersionChangeConfig<TNewSchema, TOldSchema, TLegacyDataSchema>,
): VersionChangeConstructor {
	return class extends VersionChange<
		TNewSchema,
		TOldSchema,
		TLegacyDataSchema
	> {
		readonly name = config.name;
		readonly newVersion = config.newVersion;
		readonly oldVersion = config.oldVersion;
		readonly description = config.description;
		readonly affectedResources = config.affectedResources;
		readonly newSchema = config.newSchema;
		readonly oldSchema = config.oldSchema;
		readonly legacyDataSchema = config.legacyDataSchema;
		readonly affectsRequest = config.affectsRequest ?? false;
		readonly affectsResponse = config.affectsResponse ?? true;
		readonly hasSideEffects = config.hasSideEffects ?? false;

		transformRequest(params: {
			input: z.infer<TOldSchema>;
			legacyData?: TLegacyDataSchema extends ZodType
				? z.infer<TLegacyDataSchema>
				: never;
			ctx: SharedContext;
		}): z.infer<TNewSchema> {
			if (config.transformRequest) {
				const result = config.transformRequest(params);
				return result;
			}
			return super.transformRequest(params);
		}

		transformResponse(params: {
			input: z.infer<TNewSchema>;
			legacyData?: TLegacyDataSchema extends ZodType
				? z.infer<TLegacyDataSchema>
				: never;
			ctx: SharedContext;
		}): z.infer<TOldSchema> {
			if (config.transformResponse) {
				const result = config.transformResponse(
					params,
				) satisfies z.infer<TOldSchema>;
				// Note: TypeScript allows excess properties in spreads. Use .strict() for compile-time errors.
				const parsed = this.oldSchema.safeParse(result);
				if (!parsed.success) {
					return result as z.infer<TOldSchema>;
				}
				return parsed.data;
			}
			return super.transformResponse(params);
		}
	};
}
