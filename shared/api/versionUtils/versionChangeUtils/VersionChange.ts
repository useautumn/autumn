import type { ZodType, z } from "zod/v4";
import type { ApiVersion } from "../ApiVersion.js";

/**
 * Resources that can be affected by version changes
 */
export enum AffectedResource {
	Customer = "customer",
	CusProduct = "cus_product",
	CusFeature = "cus_feature",
	CusBalance = "cus_balance",
	Invoice = "invoice",
	Product = "product",
	// Add more as needed
}

/**
 * Abstract base class for bidirectional version changes with Zod schema validation
 *
 * Uses Zod schemas for runtime validation and type inference.
 *
 * @example
 * // Features changed from array to object in V1_2
 * const V1_2_FeaturesSchema = z.record(z.string(), APICusFeatureSchema);
 * const V1_1_FeaturesSchema = z.array(APICusFeatureSchema);
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
	TDataSchema extends ZodType = ZodType,
> {
	/**
	 * The version this change was introduced in
	 */
	abstract readonly version: ApiVersion;

	/**
	 * Human-readable description of the change
	 */
	abstract readonly description: string;

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
	 * Optional Zod schema for additional context data
	 */
	readonly dataSchema?: TDataSchema;

	/**
	 * Whether this change affects request transformations
	 * Default: true
	 */
	readonly affectsRequest: boolean = true;

	/**
	 * Whether this change affects response transformations
	 * Default: true
	 */
	readonly affectsResponse: boolean = true;

	/**
	 * Whether this change has side effects beyond transformation
	 * If true, transforms become no-ops and you must handle logic elsewhere
	 */
	readonly hasSideEffects: boolean = false;

	/**
	 * Transform request data forward (old → new format)
	 * Applied when user sends old version, we transform to latest
	 *
	 * @param input - Request data in previous version format (validated against oldSchema)
	 * @param data - Additional context data for transformation (validated against dataSchema if provided)
	 * @returns Data in current version format (should match newSchema)
	 */
	transformRequest({
		input,
		data: _data,
	}: {
		input: z.infer<TOldSchema>;
		data?: TDataSchema extends ZodType ? z.infer<TDataSchema> : never;
	}): z.infer<TNewSchema> {
		// Default: no-op (override if change affects requests)
		return input as unknown as z.infer<TNewSchema>;
	}

	/**
	 * Transform response data backward (new → old format)
	 * Applied when user expects old version, we transform from latest
	 *
	 * @param input - Response data in current version format (validated against newSchema)
	 * @param data - Additional context data for transformation (validated against dataSchema if provided)
	 * @returns Data in previous version format (should match oldSchema)
	 */
	transformResponse({
		input,
		data: _data,
	}: {
		input: z.infer<TNewSchema>;
		data?: TDataSchema extends ZodType ? z.infer<TDataSchema> : never;
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

	/**
	 * Get the name of this change class
	 */
	get name(): string {
		return this.constructor.name;
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
