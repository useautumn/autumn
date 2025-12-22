import { EntitlementSchema, PriceSchema } from "@autumn/shared";
import { z } from "zod/v4";
import { FullCusProductSchema } from "../../../../../shared/models/cusProductModels/cusProductModels";

// manualInvoice?: {
//   items: Stripe.InvoiceItemCreateParams[];
//   finalize: boolean;
//   chargeAutomatically: boolean;
// };
// subscription?: {
//   action: "create" | "update" | "cancel";
//   params: SubscriptionParams;
// };
// subscriptionItemUpdates?: { itemId: string; quantity: number }[];
// checkout?: Stripe.Checkout.SessionCreateParams;

export const StripeBillingPlanSchema = z.object({
	subscription: z.object({
		action: z.enum(["create", "update", "cancel"]),
		params: z.object({
			items: z.array(z.object({ id: z.string(), quantity: z.number() })),
		}),
	}),
});

export const AutumnBillingPlanSchema = z.object({
	insertCusProducts: z.array(FullCusProductSchema),

	updateCusProduct: z.object({
		cusProductId: z.string(),
		action: z.enum(["expire"]),
	}),

	insertCustomPrices: z.array(PriceSchema),
	insertCustomEntitlements: z.array(EntitlementSchema),

	// expireCusProducts: z.array(z.string()),

	// updateCusProduct: z.object({
	// 	cusProductId: z.string(),
	// 	options: z.array(FeatureOptionsSchema),
	// }),
	// entitlementChanges: z.array(
	// 	z.object({ cusEntId: z.string(), delta: z.number() }),
	// ),
});

export const BillingPlanSchema = z.object({
	intent: z.enum(["update_quantity", "update_plan"]),
	featureQuantities: z.array(
		z.object({
			featureId: z.string(),
			quantity: z.number(),
		}),
	),
});
