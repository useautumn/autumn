import {
	type ApiBalanceBreakdownV1,
	ApiBalanceBreakdownV1Schema,
	type ApiBalanceV1,
	ApiBalanceV1Schema,
	type AttachPreviewResponse,
	AttachPreviewResponseSchema,
	type BillingPreviewResponse,
	BillingPreviewResponseSchema,
	type PreviewLineItem,
	PreviewLineItemSchema,
} from "@autumn/shared";
import type { z } from "zod/v4";

/**
 * Extract the object literal type from a schema with an `object` field.
 */
type ExtractObjectType<T> = T extends { object: infer O } ? O : never;

/**
 * A filter config entry that maps an object type to fields to omit.
 */
type FilterConfigEntry<T> = {
	objectType: ExtractObjectType<T>;
	omitFields: (keyof T)[];
};

/**
 * Creates a strongly-typed filter config entry.
 * Ensures the object type and fields match the schema.
 */
function createFilterConfig<T extends { object: string }>({
	schema,
	omitFields,
}: {
	schema: z.ZodType<T>;
	omitFields: (keyof T)[];
}): FilterConfigEntry<T> {
	// Parse just to extract the object type from the schema's shape
	const shape = (schema as z.ZodObject<z.ZodRawShape>).shape;
	const objectField = shape.object as z.ZodLiteral<string>;
	const objectType = objectField.value as ExtractObjectType<T>;

	return {
		objectType,
		omitFields,
	};
}

/**
 * Filter configurations for each object type.
 * Use createFilterConfig for type safety.
 */
const filterConfigs = [
	createFilterConfig<ApiBalanceBreakdownV1>({
		schema: ApiBalanceBreakdownV1Schema,
		omitFields: ["overage", "object"],
	}),
	createFilterConfig<ApiBalanceV1>({
		schema: ApiBalanceV1Schema,
		omitFields: ["object"],
	}),
	createFilterConfig<PreviewLineItem>({
		schema: PreviewLineItemSchema,
		omitFields: [
			"effective_period",
			"deferred_for_trial",
			"is_base",
			"object",
			"total_quantity",
			"paid_quantity",
			"title",
		],
	}),
	createFilterConfig<BillingPreviewResponse>({
		schema: BillingPreviewResponseSchema,
		omitFields: ["period_start", "period_end", "object"],
	}),
	createFilterConfig<AttachPreviewResponse>({
		schema: AttachPreviewResponseSchema,
		omitFields: [
			"redirect_type",
			"incoming",
			"outgoing",
			"object",
			"period_start",
			"period_end",
		],
	}),
];

/**
 * Runtime config mapping object type to fields to omit.
 * Built from the typed filterConfigs array.
 */
export const responseFilterConfig: Record<string, string[]> =
	Object.fromEntries(
		filterConfigs.map((config) => [
			config.objectType,
			config.omitFields as string[],
		]),
	);
