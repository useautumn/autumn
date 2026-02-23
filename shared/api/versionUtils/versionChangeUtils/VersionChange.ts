import type { ZodType, z } from "zod/v4";
import type { SharedContext } from "../../../types/sharedContext.js";
import type { ApiVersion } from "../ApiVersion.js";

// /**
//  * Context passed to version transforms for accessing runtime data
//  */
// export interface VersionContext {
// 	features: Feature[];
// }

/**
 * Resources that can be affected by version changes
 */
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
	Checkout = "checkout",
	Attach = "attach",
	MultiAttach = "multi_attach",
	ApiSubscriptionUpdate = "api_subscription_update",
	EventsAggregate = "events_aggregate",
	// Add more as needed
}

/**
 * Abstract base class for bidirectional version changes with Zod schema validation
 *
 * Uses Zod schemas for runtime validation and type inference.
 *
 * @example
 * // Features changed from array to object in V1_2
 * const V1_2_FeaturesSchema = z.record(z.string(), ApiCusFeatureSchema);
 * const V1_1_FeaturesSchema = z.array(ApiCusFeatureSchema);
 *
 * class V1_2_FeaturesArrayToObject extends VersionChange {
 *   version = ApiVersion.V1_2;
 *   description = "Features: array ↔ object";
 *   affectedResources = [AffectedResource.CusFeature];
 *
 *   newSchema = V1_2_FeaturesSchema;
 *   oldSchema = V1_1_FeaturesSchema;
 *
 *   transformResponse({ input }) {
 *     // input is validated against newSchema
 *     return Object.values(input); // Returns V1_1 format (array)
 *   }
 * }
 */
export abstract class VersionChange<
	TNewSchema extends ZodType = ZodType,
	TOldSchema extends ZodType = ZodType,
	TLegacyDataSchema extends ZodType = ZodType,
> {
	/**
	 * Optional name for debugging purposes
	 */
	readonly name?: string;

	/**
	 * The newer version where the breaking change was introduced
	 */
	abstract readonly newVersion: ApiVersion;

	/**
	 * The older version - transform is applied when targetVersion <= oldVersion
	 */
	abstract readonly oldVersion: ApiVersion;

	/**
	 * Human-readable description of the change
	 * Can be a single string or an array of strings for multiple changes
	 */
	abstract readonly description: string | string[];

	/**
	 * Resources affected by this change
	 */
	abstract readonly affectedResources: AffectedResource[];

	/**
	 * Zod schema for the newer version format
	 */
	abstract readonly newSchema: TNewSchema;

	/**
	 * Zod schema for the older version format
	 */
	abstract readonly oldSchema: TOldSchema;

	/**
	 * Optional Zod schema for legacy fields data (deprecated fields from newer versions)
	 */
	readonly legacyDataSchema?: TLegacyDataSchema;

	/**
	 * Whether this change affects request transformations
	 * @default false
	 */
	readonly affectsRequest: boolean = false;

	/**
	 * Whether this change affects response transformations
	 * @default true
	 */
	readonly affectsResponse: boolean = true;

	/**
	 * Whether this change has side effects beyond transformation
	 * If true, transforms become no-ops and you must handle logic elsewhere
	 * @default false
	 */
	readonly hasSideEffects: boolean = false;

	/**
	 * Transform request data forward (old → new format)
	 * Applied when user sends old version, we transform to latest
	 *
	 * @param input - Request data in previous version format (validated against oldSchema)
	 * @param legacyData - Legacy fields data for transformation (validated against legacyDataSchema if provided)
	 * @returns Data in current version format (should match newSchema)
	 */
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
		// Default: no-op (override if change affects requests)
		return input as unknown as z.infer<TNewSchema>;
	}

	/**
	 * Transform response data backward (new → old format)
	 * Applied when user expects old version, we transform from latest
	 *
	 * @param input - Response data in current version format (validated against newSchema)
	 * @param legacyData - Legacy fields data for transformation (validated against legacyDataSchema if provided)
	 * @param ctx - Optional runtime context for accessing additional data (e.g., features)
	 * @returns Data in previous version format (should match oldSchema)
	 */
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
		// Default: no-op (override if change affects responses)
		return input as unknown as z.infer<TOldSchema>;
	}

	/**
	 * Check if this change affects a specific resource
	 */
	affects(resource: AffectedResource): boolean {
		return this.affectedResources.includes(resource);
	}
}

/**
 * Helper type for constructing version changes
 */
export type VersionChangeConstructor = new () => VersionChange<
	ZodType,
	ZodType,
	ZodType
>;

/**
 * Configuration interface for version changes
 * Use this with defineVersionChange() for full autocomplete and type safety
 */
export interface VersionChangeConfig<
	TNewSchema extends ZodType = ZodType,
	TOldSchema extends ZodType = ZodType,
	TLegacyDataSchema extends ZodType = ZodType,
> {
	/** Optional name for debugging purposes */
	name?: string;

	/** The newer version where the breaking change was introduced */
	newVersion: ApiVersion;

	/** The older version - transform is applied when targetVersion <= oldVersion */
	oldVersion: ApiVersion;

	/** Human-readable description of the change (single string or array of strings) */
	description: string | string[];

	/** Resources affected by this change */
	affectedResources: AffectedResource[];

	/** Zod schema for the newer version format */
	newSchema: TNewSchema;

	/** Zod schema for the older version format */
	oldSchema: TOldSchema;

	/** Optional Zod schema for legacy fields data (deprecated fields from newer versions) */
	legacyDataSchema?: TLegacyDataSchema;

	/**
	 * Whether this change affects request transformations
	 * @default false
	 */
	affectsRequest?: boolean;

	/**
	 * Whether this change affects response transformations
	 * @default true
	 */
	affectsResponse?: boolean;

	/**
	 * Whether this change has side effects beyond transformation
	 * If true, transforms become no-ops and you must handle logic elsewhere
	 * @default false
	 */
	hasSideEffects?: boolean;

	/**
	 * Transform request data forward (old → new format)
	 * Applied when user sends old version, we transform to latest
	 */
	transformRequest?: (params: {
		input: z.infer<TOldSchema>;
		legacyData?: TLegacyDataSchema extends ZodType
			? z.infer<TLegacyDataSchema>
			: never;
		ctx: SharedContext;
	}) => z.infer<TNewSchema>;

	/**
	 * Transform response data backward (new → old format)
	 * Applied when user expects old version, we transform from latest
	 *
	 * Note: Output is validated with safeParse() - validation failures return
	 * unvalidated data to ensure graceful degradation. Successful validation
	 * strips extra fields. For compile-time excess property errors, use schema.strict().
	 */
	transformResponse?: (params: {
		input: z.infer<TNewSchema>;
		legacyData?: TLegacyDataSchema extends ZodType
			? z.infer<TLegacyDataSchema>
			: never;
		ctx: SharedContext;
	}) => z.infer<TOldSchema>;
}

/**
 * Helper to define version changes with full autocomplete and type safety
 *
 * @example
 * export const V1_2_FeaturesArrayToObject = defineVersionChange({
 *   version: ApiVersion.V1_2,
 *   description: "Features: object → array",
 *   affectedResources: [AffectedResource.Customer],
 *   newSchema: V1_2_FeaturesSchema,
 *   oldSchema: V1_1_FeaturesSchema,
 *   affectsRequest: false,
 *   affectsResponse: true,
 *   hasSideEffects: true, // ← Full autocomplete for all options!
 *   transformResponse: ({ input }) => Object.values(input),
 * });
 */
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
				// Validate with safeParse - gracefully handles failures without throwing
				// const parsed = this.newSchema.safeParse(result);
				// if (!parsed.success) {
				// 	// Return unvalidated result to avoid breaking the request
				// 	return result as z.infer<TNewSchema>;
				// }
				// return parsed.data;
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
				// Validate with safeParse - gracefully handles failures without throwing
				// Note: TypeScript allows excess properties in spreads. Use .strict() for compile-time errors.
				const parsed = this.oldSchema.safeParse(result);
				if (!parsed.success) {
					// Return unvalidated result to avoid breaking the request
					return result as z.infer<TOldSchema>;
				}
				return parsed.data;
			}
			return super.transformResponse(params);
		}
	};
}
