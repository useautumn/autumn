import { z } from "zod/v4";
import {
	type AttachPreviewResponse,
	AttachPreviewResponseSchema,
} from "../../billing/common/attachPreviewResponse";
import {
	type BillingPreviewResponse,
	BillingPreviewResponseSchema,
	type PreviewLineItem,
	PreviewLineItemSchema,
} from "../../billing/common/billingPreviewResponse";
import {
	type PreviewUpdateSubscriptionResponse,
	PreviewUpdateSubscriptionResponseSchema,
} from "../../billing/updateSubscription/previewUpdateSubscriptionResponse";
import {
	type ApiInvoicePreviewV0,
	ApiInvoicePreviewV0Schema,
} from "../../customers/components/apiInvoicePreview/apiInvoicePreviewV0";
import {
	type ApiBalanceBreakdownV1,
	ApiBalanceBreakdownV1Schema,
	type ApiBalanceV1,
	ApiBalanceV1Schema,
} from "../../customers/cusFeatures/apiBalanceV1";
import {
	type ApiFlagV0,
	ApiFlagV0Schema,
} from "../../customers/flags/apiFlagV0";
import {
	type CustomerEligibility,
	CustomerEligibilitySchema,
} from "../../products/components/customerEligibility";

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
function createFilterConfig<T extends { object?: string }>({
	schema,
	omitFields,
}: {
	schema: z.ZodType<T>;
	omitFields: (keyof T)[];
}): FilterConfigEntry<T> {
	// Parse just to extract the object type from the schema's shape
	const shape = (schema as z.ZodObject<z.ZodRawShape>).shape;
	let objectField = shape.object;

	// Unwrap ZodOptional if the object field is optional
	if (objectField instanceof z.ZodOptional) {
		objectField = objectField.unwrap();
	}

	const objectType = (objectField as z.ZodLiteral<string>)
		.value as ExtractObjectType<T>;

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
		omitFields: ["custom", "object"],
	}),
	createFilterConfig<BillingPreviewResponse>({
		schema: BillingPreviewResponseSchema,
		omitFields: ["object"],
	}),
	createFilterConfig<AttachPreviewResponse>({
		schema: AttachPreviewResponseSchema,
		omitFields: ["object"],
	}),
	createFilterConfig<PreviewUpdateSubscriptionResponse>({
		schema: PreviewUpdateSubscriptionResponseSchema,
		omitFields: ["object"],
	}),
	createFilterConfig<ApiFlagV0>({
		schema: ApiFlagV0Schema,
		omitFields: ["object"],
	}),
	createFilterConfig<CustomerEligibility>({
		schema: CustomerEligibilitySchema,
		omitFields: ["object", "scenario"],
	}),
	// The Stripe subscription id stays internal: the dashboard keys previews and
	// deep links off it, but it isn't part of the public contract.
	createFilterConfig<ApiInvoicePreviewV0>({
		schema: ApiInvoicePreviewV0Schema,
		omitFields: ["subscription_id", "object"],
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
