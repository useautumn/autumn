import type Stripe from "stripe";
import type { FullCustomer } from "../cusModels/fullCusModel.js";
import type { FeatureOptions } from "../cusProductModels/cusProductModels.js";
import type { FreeTrial } from "../productModels/freeTrialModels/freeTrialModels.js";
import type { FullProduct } from "../productModels/productModels.js";

export type AttachContext = {
	// Core
	fullCus: FullCustomer;
	products: FullProduct[];

	freeTrial?: FreeTrial;
	featureQuantities: FeatureOptions[];

	// Stripe
	sub?: Stripe.Subscription;
	schedule?: Stripe.SubscriptionSchedule;
	testClockFrozenTime?: number; // in milliseconds since epoch
	paymentMethod?: Stripe.PaymentMethod;
};

// stripeCli: Stripe;
// stripeCus?: Stripe.Customer;
// now?: number;
// paymentMethod: Stripe.PaymentMethod | null | undefined;
// rewards?: Reward[];

// org: Organization;
// // customer: Customer;
// customer: FullCustomer;
// cusProduct?: FullCusProduct; // cus product to expire or cancel...

// freeTrial: FreeTrial | null;
// optionsList: FeatureOptions[];
// productsList?: ProductOptions[];

// successUrl?: string | undefined;
// itemSets?: any[];
// cusProducts: FullCusProduct[];

// // Options to update
// optionsToUpdate?: {
// 	old: FeatureOptions;
// 	new: FeatureOptions;
// }[];

// replaceables: AttachReplaceable[];

// // CONFIGS
// invoiceOnly?: boolean | undefined;
// billingAnchor?: number | undefined;
// metadata?: Record<string, string> | undefined;

// entities: Entity[];

// isCustom?: boolean;
// disableFreeTrial?: boolean;
// features: Feature[];

// entityId?: string;
// internalEntityId?: string;

// checkoutSessionParams?: unknown;
// apiVersion?: ApiVersion;
// scenario?: AttachScenario;

// fromMigration?: boolean;
// finalizeInvoice?: boolean;
// req?: AutumnContext;
// fromCancel?: boolean;
// setupPayment?: boolean;

// // For invoice checkout...
// anchorToUnix?: number;
// subId?: string;
// config?: AttachConfig;

// // Invoice action required
// stripeInvoiceId?: string;
// cusEntIds?: string[];
