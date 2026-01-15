import type {
	ApiVersion,
	AttachBranch,
	AttachConfig,
	AttachReplaceable,
	AttachScenario,
	Customer,
	EntitlementWithFeature,
	Entity,
	Feature,
	FeatureOptions,
	FreeTrial,
	FullCusProduct,
	FullCustomer,
	FullProduct,
	Organization,
	Price,
	ProductOptions,
	Reward,
} from "@autumn/shared";
import type Stripe from "stripe";
import type { AutumnContext } from "../../../honoUtils/HonoEnv";

// Get misc

export type AttachParams = {
	stripeCli: Stripe;
	stripeCus?: Stripe.Customer;
	now?: number;
	paymentMethod: Stripe.PaymentMethod | null | undefined;
	rewards?: Reward[];

	org: Organization;
	// customer: Customer;
	customer: FullCustomer;
	cusProduct?: FullCusProduct; // cus product to expire or cancel...
	products: FullProduct[];

	prices: Price[];
	entitlements: EntitlementWithFeature[];

	freeTrial: FreeTrial | null;
	optionsList: FeatureOptions[];
	productsList?: ProductOptions[];

	successUrl?: string | undefined;
	itemSets?: any[];
	cusProducts: FullCusProduct[];

	// Options to update
	optionsToUpdate?: {
		old: FeatureOptions;
		new: FeatureOptions;
	}[];

	replaceables: AttachReplaceable[];

	// CONFIGS
	invoiceOnly?: boolean | undefined;
	billingAnchor?: number | undefined;
	metadata?: Record<string, string> | undefined;

	entities: Entity[];

	isCustom?: boolean;
	disableFreeTrial?: boolean;
	features: Feature[];

	entityId?: string;
	internalEntityId?: string;

	checkoutSessionParams?: unknown;
	apiVersion?: ApiVersion;
	scenario?: AttachScenario;

	fromMigration?: boolean;
	finalizeInvoice?: boolean;
	req?: AutumnContext;
	fromCancel?: boolean;
	setupPayment?: boolean;

	// For invoice checkout...
	anchorToUnix?: number;
	subId?: string;
	config?: AttachConfig;

	// Invoice action required
	stripeInvoiceId?: string;
	cusEntIds?: string[];

	newBillingSubscription?: boolean;
	branch?: AttachBranch;
};

export type InsertCusProductParams = {
	req?: AutumnContext;
	now?: number;

	customer: Customer;
	org: Organization;
	product: FullProduct;
	prices: Price[];
	entitlements: EntitlementWithFeature[];

	freeTrial: FreeTrial | null;
	optionsList: FeatureOptions[];

	successUrl?: string | undefined;
	itemSets?: any[];

	curCusProduct?: FullCusProduct | undefined;
	cusProducts?: FullCusProduct[];
	replaceables: AttachReplaceable[];

	// CONFIGS
	invoiceOnly?: boolean | undefined;
	entities: Entity[];
	isCustom?: boolean;
	disableFreeTrial?: boolean;
	features: Feature[];
	fromCancel?: boolean;

	entityId?: string;
	internalEntityId?: string;
	fromMigration?: boolean;
	apiVersion?: ApiVersion;
	finalizeInvoice?: boolean;

	newBillingSubscription?: boolean;
};

// export const AttachResultSchema = z.object({
// 	customer_id: z.string(),
// 	product_ids: z.array(z.string()),
// 	code: z.string(),
// 	message: z.string(),

// 	checkout_url: z.string().nullish(),
// 	invoice: z.any().nullish(),
// });

// export type AttachResult = z.infer<typeof AttachResultSchema>;
