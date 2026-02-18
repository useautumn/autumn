import type { BillingContext } from "@autumn/shared";
import {
	ApiVersion,
	ApiVersionClass,
	AppEnv,
	BillingVersion,
	type Feature,
	type FullCusProduct,
	type FullProduct,
} from "@autumn/shared";
import type Stripe from "stripe";
import { logger } from "@/external/logtail/logtailUtils";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { stripeCustomers } from "../stripe/customers";
import { customers } from "./customers";

/**
 * Create an organization fixture
 */
const createOrg = () => ({
	id: "org_test",
	name: "Test Organization",
	slug: "test-org",
	default_currency: "usd",
	stripe_account_id: "acct_test",
});

/**
 * Create an Autumn context fixture
 */
const create = ({
	features = [],
	org,
}: {
	features?: Feature[];
	org?: ReturnType<typeof createOrg>;
}): AutumnContext =>
	({
		features,
		org: org ?? createOrg(),
		apiVersion: new ApiVersionClass(ApiVersion.V1_2),
		env: AppEnv.Sandbox,
		logger: logger,
	}) as unknown as AutumnContext;

/**
 * Create a billing context fixture
 */
const createBilling = ({
	customerProducts = [],
	fullProducts = [],
	stripeSubscription,
	stripeSubscriptionSchedule,
	currentEpochMs = Date.now(),
	billingCycleAnchorMs = "now",
	resetCycleAnchorMs = "now",
	billingVersion = BillingVersion.V1,
}: {
	customerProducts?: FullCusProduct[];
	fullProducts?: FullProduct[];
	stripeSubscription?: Stripe.Subscription;
	stripeSubscriptionSchedule?: Stripe.SubscriptionSchedule;
	currentEpochMs?: number;
	billingCycleAnchorMs?: number | "now";
	resetCycleAnchorMs?: number | "now";
	billingVersion?: BillingVersion;
}): BillingContext => ({
	fullCustomer: customers.create({ customerProducts }),
	stripeCustomer: stripeCustomers.create(),
	fullProducts,
	featureQuantities: [],
	currentEpochMs,
	billingCycleAnchorMs,
	resetCycleAnchorMs,
	stripeSubscription,
	stripeSubscriptionSchedule,
	customPrices: [],
	customEnts: [],
	isCustom: false,
	billingVersion,
});

// ═══════════════════════════════════════════════════════════════════
// EXPORT
// ═══════════════════════════════════════════════════════════════════

export const contexts = {
	create,
	createOrg,
	createBilling,
} as const;
