// Auto-generated Zod schema
import { z } from "zod";
import type { CustomerData } from "./customerDataTypes";
import { CustomerDataSchema } from "./customerDataTypes";
import type { EntityData } from "./entityDataTypes";
import { EntityDataSchema } from "./entityDataTypes";

export const CheckoutParamsOptionSchema = z.object({
	featureId: z.string(),
	quantity: z.number(),
	adjustableQuantity: z.boolean().nullable().optional(),
	internalFeatureId: z.string().nullable().optional(),
	upcomingQuantity: z.number().nullable().optional(),
});

export const CheckoutParamsSchema = z.object({
	checkoutSessionParams: z
		.unknown()
		.describe(
			"Additional parameters to pass onto Stripe when creating the checkout session",
		)
		.optional(),
	customerData: CustomerDataSchema.describe(
		"If auto creating a customer, the properties from this field will be used.",
	).optional(),
	entityData: EntityDataSchema.describe(
		"If attaching a product to an entity and auto creating the entity, the properties\nfrom this field will be used. feature_id is required.",
	).optional(),
	entityId: z
		.string()
		.nullable()
		.describe(
			"If attaching a product to an entity, can be used to auto create the entity",
		)
		.optional(),
	forceCheckout: z
		.boolean()
		.describe(
			"Always return a Stripe Checkout URL, even if the customer's card is already on\nfile",
		)
		.optional(),
	freeTrial: z
		.boolean()
		.describe(
			"If the product has a free trial, this field can be used to disable it when\nattaching (by passing in false)",
		)
		.optional(),
	invoice: z.boolean().optional(),
	options: z
		.array(CheckoutParamsOptionSchema)
		.nullable()
		.describe("Pass in quantities for prepaid features")
		.optional(),
	productId: z
		.string()
		.nullable()
		.describe(
			"Product ID, set when creating the product in the Autumn dashboard",
		)
		.optional(),
	productIds: z
		.array(z.string())
		.nullable()
		.describe(
			"Can be used to attach multiple products to the customer at once. For example,\nattaching a main product and an add-on.",
		)
		.optional(),
	reward: z
		.union([z.string(), z.array(z.string())])
		.describe("An Autumn promo_code or reward_id to apply at checkout")
		.optional(),
	setupPayment: z.boolean().optional(),
	successUrl: z
		.string()
		.describe("URL to redirect to after the purchase is successful")
		.optional(),
	dialog: z.any().optional().describe("Dialog configuration for checkout flow"),
	openInNewTab: z
		.boolean()
		.optional()
		.describe("Whether to open checkout in a new tab"),
});

export interface CheckoutParamsOption {
	featureId: string;

	quantity: number;

	adjustableQuantity?: boolean | null;

	internalFeatureId?: string | null;

	upcomingQuantity?: number | null;
}

export interface CheckoutParams {
	/**
	 * Additional parameters to pass onto Stripe when creating the checkout session
	 */
	checkoutSessionParams?: unknown;

	/**
	 * If auto creating a customer, the properties from this field will be used.
	 */
	customerData?: CustomerData;

	/**
   * If attaching a product to an entity and auto creating the entity, the properties
from this field will be used. feature_id is required.
   */
	entityData?: EntityData;

	/**
	 * If attaching a product to an entity, can be used to auto create the entity
	 */
	entityId?: string | null;

	/**
   * Always return a Stripe Checkout URL, even if the customer's card is already on
file
   */
	forceCheckout?: boolean;

	/**
   * If the product has a free trial, this field can be used to disable it when
attaching (by passing in false)
   */
	freeTrial?: boolean;

	invoice?: boolean;

	/**
	 * Pass in quantities for prepaid features
	 */
	options?: CheckoutParamsOption[] | null;

	/**
	 * Product ID, set when creating the product in the Autumn dashboard
	 */
	productId?: string | null;

	/**
   * Can be used to attach multiple products to the customer at once. For example,
attaching a main product and an add-on.
   */
	productIds?: string[] | null;

	/**
	 * An Autumn promo_code or reward_id to apply at checkout
	 */
	reward?: string | Array<string>;

	setupPayment?: boolean;

	/**
	 * URL to redirect to after the purchase is successful
	 */
	successUrl?: string;

	/**
	 * Dialog configuration for checkout flow
	 */
	dialog?: any;

	/**
	 * Whether to open checkout in a new tab
	 */
	openInNewTab?: boolean;
}
