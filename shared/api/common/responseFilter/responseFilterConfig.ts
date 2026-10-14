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

type ExtractObjectType<T> = T extends { object: infer O } ? O : never;

type FilterConfigEntry<T> = {
	objectType: ExtractObjectType<T>;
	omitFields: (keyof T)[];
};

function createFilterConfig<T extends { object?: string }>({
	schema,
	omitFields,
}: {
	schema: z.ZodType<T>;
	omitFields: (keyof T)[];
}): FilterConfigEntry<T> {
	const shape = (schema as z.ZodObject<z.ZodRawShape>).shape;
	let objectField = shape.object;

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
	createFilterConfig<ApiInvoicePreviewV0>({
		schema: ApiInvoicePreviewV0Schema,
		omitFields: ["subscription_id", "object"],
	}),
];

export const responseFilterConfig: Record<string, string[]> =
	Object.fromEntries(
		filterConfigs.map((config) => [
			config.objectType,
			config.omitFields as string[],
		]),
	);
