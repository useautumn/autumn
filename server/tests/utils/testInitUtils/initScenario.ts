import type { CustomerData } from "@autumn/shared";
import {
	ApiVersion,
	type CreateReward,
	type CreateRewardProgram,
	type CustomerBillingControlsParams,
	type EntitlementDuration,
	type OrgConfig,
	type PlanTiming,
	type ProductItem,
	type ProductV2,
	type ReferralCode,
	type RewardEntitlement,
	type RewardRedemption,
	RewardType,
} from "@autumn/shared";
import { resetAndGetCusEnt } from "@tests/balances/track/rollovers/rolloverTestUtils.js";
import { addHours, addMonths } from "date-fns";
import type Stripe from "stripe";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { removeAllPaymentMethods } from "@/external/stripe/customers/paymentMethods/operations/removeAllPaymentMethods.js";
import { CusService } from "@/internal/customers/CusService.js";
import { rewardRepo } from "@/internal/rewards/repos/index.js";
import { generateId } from "@/utils/genUtils.js";
import { attachPaymentMethod as attachPaymentMethodFn } from "@/utils/scriptUtils/initCustomer.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";
import { hoursToFinalizeInvoice } from "../constants.js";
import { createReferralProgram, createReward } from "../productUtils.js";
import { advanceTestClock as advanceTestClockFn } from "../stripeUtils.js";
import {
	createSubOrgTestContext,
	type TaxRegistrationCountry,
} from "./createSubOrgTestContext.js";
import defaultCtx, { type TestContext } from "./createTestContext.js";

// ═══════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════

type FeatureOption = {
	feature_id: string;
	quantity: number;
};

type EntityConfig = {
	count: number;
	featureId: string;
	defaultGroup?: string;
};

type GeneratedEntity = {
	id: string;
	name: string;
	featureId: string;
};

type GeneratedLicenseAssignment = {
	id: string;
	entity_id: string;
	license_plan_id: string;
	started_at: number;
	ended_at: number | null;
};

type OtherCustomerConfig = {
	id: string;
	paymentMethod?: "success" | "fail" | "authenticate" | "alipay";
	data?: CustomerData;
	/** Create a separate Stripe test clock for this customer instead of sharing the primary customer's clock */
	distinctTestClock?: boolean;
};

type ReferralProgramConfig = {
	reward: CreateReward;
	program: CreateRewardProgram;
};

type RewardConfig = {
	reward: CreateReward;
	productId: string;
};

type FeatureGrantEntitlement = {
	feature_id: string;
	// Optional: boolean features grant on/off access with no allowance
	allowance?: number;
	expiry?: { duration: EntitlementDuration; length: number };
};

type FeatureGrantConfig = {
	id?: string;
	name?: string;
	entitlements: FeatureGrantEntitlement[];
	promoCodes: {
		code: string;
		max_redemptions?: number;
		first_time_transaction?: boolean;
	}[];
};

// Discriminated union for all action types
type AttachAction = {
	type: "attach";
	productId: string;
	customerId?: string; // Override: use this customer instead of primary
	entityIndex?: number;
	options?: FeatureOption[];
	newBillingSubscription?: boolean;
	timeout?: number;
};

type CancelAction = {
	type: "cancel";
	productId: string;
	entityIndex?: number;
};

type AdvanceClockAction = {
	type: "advanceClock";
	days?: number;
	weeks?: number;
	hours?: number;
	months?: number;
	toNextInvoice?: boolean;
	waitForSeconds?: number;
};

type AttachPaymentMethodAction = {
	type: "attachPaymentMethod";
	paymentMethodType: "success" | "fail" | "authenticate" | "alipay";
};

type RemovePaymentMethodAction = {
	type: "removePaymentMethod";
};

type TrackAction = {
	type: "track";
	featureId: string;
	value: number;
	entityIndex?: number;
	timeout?: number;
};

type UpdateSubscriptionAction = {
	type: "updateSubscription";
	productId: string;
	entityIndex?: number;
	cancelAction?: "cancel_end_of_cycle" | "cancel_immediately" | "uncancel";
	items?: ProductItem[];
};

type AdvanceToNextInvoiceAction = {
	type: "advanceToNextInvoice";
	withPause?: boolean;
};

type BillingAttachAction = {
	type: "billingAttach";
	productId: string;
	customerId?: string; // Override: use this customer instead of primary
	entityIndex?: number;
	options?: FeatureOption[];
	licenseQuantities?: { licenseProductId: string; quantity: number }[];
	newBillingSubscription?: boolean;
	planSchedule?: PlanTiming;
	timeout?: number;
	items?: ProductItem[]; // Custom product items (creates is_custom product)
	subscriptionId?: string;
	invoice?: boolean;
	enableProductImmediately?: boolean;
	finalizeInvoice?: boolean;
	billingControls?: CustomerBillingControlsParams;
};

type MultiAttachPlan = {
	productId: string;
	featureQuantities?: FeatureOption[];
	version?: number;
};

type BillingMultiAttachAction = {
	type: "billingMultiAttach";
	plans: MultiAttachPlan[];
	entityIndex?: number;
	freeTrial?: { length: number; duration: string; card_required?: boolean };
	timeout?: number;
};

type LinkLicenseAction = {
	type: "linkLicense";
	parentProductId: string;
	licenseProductId: string;
	included: number;
	prepaidOnly?: boolean;
	metadata?: Record<string, unknown>;
};

type AssignLicenseAction = {
	type: "assignLicense";
	licenseProductId: string;
	entityIndex?: number;
	entityIndexes?: number[];
	parentProductId?: string;
};

type CreateReferralCodeAction = {
	type: "createReferralCode";
};

type RedeemReferralCodeAction = {
	type: "redeemReferralCode";
	customerId: string;
};

type CreateAndRedeemReferralCodeAction = {
	type: "createAndRedeemReferralCode";
	customerId: string;
};

type ResetFeatureAction = {
	type: "resetFeature";
	featureId: string;
	timeout?: number;
};

type ParallelAction = {
	type: "parallel";
	actions: ScenarioAction[];
};

type RedeemRewardAction = {
	type: "redeemReward";
	code: string;
	customerId?: string;
};

type ScenarioAction =
	| AttachAction
	| CancelAction
	| AdvanceClockAction
	| AttachPaymentMethodAction
	| RemovePaymentMethodAction
	| TrackAction
	| UpdateSubscriptionAction
	| AdvanceToNextInvoiceAction
	| BillingAttachAction
	| BillingMultiAttachAction
	| LinkLicenseAction
	| AssignLicenseAction
	| CreateReferralCodeAction
	| RedeemReferralCodeAction
	| CreateAndRedeemReferralCodeAction
	| ResetFeatureAction
	| ParallelAction
	| RedeemRewardAction;

type CleanupConfig = {
	customerIdsToDelete: string[];
	emailsToDelete: string[];
};

type PlatformCreateConfig = {
	slug?: string;
	name?: string;
	userEmail?: string;
	configOverrides?: Partial<OrgConfig>;
	taxRegistrations?: TaxRegistrationCountry[];
	setupDefaultFeatures?: boolean;
};

type ScenarioConfig = {
	testClock: boolean;
	attachPm?: "success" | "fail" | "authenticate" | "alipay";
	customerData?: CustomerData;
	withDefault: boolean;
	defaultGroup?: string;
	skipWebhooks?: boolean;
	sendEmailReceipts?: boolean;
	nameOverride?: string | null;
	emailOverride?: string | null;
	stripeCustomerOverrides?: Partial<Stripe.CustomerCreateParams>;
	products: ProductV2[];
	productPrefix?: string;
	productCreateInStripe?: boolean;
	entityConfig?: EntityConfig;
	customerIds?: string[];
	cleanup: CleanupConfig;
	actions: ScenarioAction[];
	otherCustomers: OtherCustomerConfig[];
	referralProgram?: ReferralProgramConfig;
	rewards: RewardConfig[];
	platformConfig?: PlatformCreateConfig;
	featureGrants: FeatureGrantConfig[];
};

type ConfigFn = (config: ScenarioConfig) => ScenarioConfig;

// ═══════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════

/** Builds entities with ids "ent-1", "ent-2", etc. */
const generateEntities = (config: EntityConfig): GeneratedEntity[] => {
	return Array.from({ length: config.count }, (_, i) => ({
		id: `ent-${i + 1}`,
		name: `Entity ${i + 1}`,
		featureId: config.featureId,
	}));
};

// ═══════════════════════════════════════════════════════════════════
// SCENARIO CONFIG FUNCTIONS (s.*)
// ═══════════════════════════════════════════════════════════════════

/**
 * Configure customer options: test clock, payment method, data, default product.
 * Pass `name: null` / `email: null` for a nameless / emailless customer.
 * @example s.customer({ paymentMethod: "success" })
 * @example s.customer({ withDefault: true, defaultGroup: "enterprise" })
 */
const customer = ({
	testClock = true,
	paymentMethod,
	data,
	withDefault,
	defaultGroup,
	skipWebhooks,
	send_email_receipts,
	name,
	email,
	stripeCustomerOverrides,
}: {
	testClock?: boolean;
	paymentMethod?: "success" | "fail" | "authenticate" | "alipay";
	data?: CustomerData;
	withDefault?: boolean;
	defaultGroup?: string;
	skipWebhooks?: boolean;
	send_email_receipts?: boolean;
	name?: string | null;
	email?: string | null;
	stripeCustomerOverrides?: Partial<Stripe.CustomerCreateParams>;
} = {}): ConfigFn => {
	return (config) => ({
		...config,
		testClock,
		attachPm: paymentMethod ?? config.attachPm,
		customerData: data ?? config.customerData,
		withDefault: withDefault ?? config.withDefault,
		defaultGroup: defaultGroup ?? config.defaultGroup,
		skipWebhooks: skipWebhooks ?? config.skipWebhooks,
		sendEmailReceipts: send_email_receipts ?? config.sendEmailReceipts,
		nameOverride: name,
		emailOverride: email,
		stripeCustomerOverrides:
			stripeCustomerOverrides ?? config.stripeCustomerOverrides,
	});
};

/**
 * Products for this scenario. Auto-prefixed with customerId for isolation.
 * @example s.products({ list: [pro, free] })
 * @example s.products({ list: [freeDefault], prefix: "my-prefix" })
 */
const products = ({
	list,
	prefix,
	customerIdsToDelete,
	createInStripe,
}: {
	list: ProductV2[];
	prefix?: string;
	customerIdsToDelete?: string[];
	createInStripe?: boolean;
}): ConfigFn => {
	return (config) => ({
		...config,
		products: list,
		productPrefix: prefix,
		customerIds: customerIdsToDelete,
		productCreateInStripe: createInStripe,
	});
};

/**
 * Auto-generates entities with ids "ent-1", "ent-2", etc.
 * @example s.entities({ count: 2, featureId: TestFeature.Users })
 */
const entities = ({
	count,
	featureId,
	defaultGroup,
}: {
	count: number;
	featureId: string;
	defaultGroup?: string;
}): ConfigFn => {
	return (config) => ({
		...config,
		entityConfig: { count, featureId, defaultGroup },
	});
};

/**
 * Define additional customers for this test scenario.
 * Useful for referral tests where you need a referrer and redeemer.
 * By default, other customers share the primary customer's test clock.
 * Use `distinctTestClock: true` to give a customer its own clock (avoids Stripe's 3-customer-per-clock limit).
 * All test clock IDs are returned in the `testClockIds` dict keyed by customer ID.
 * @example s.otherCustomers([{ id: "redeemer", paymentMethod: "success" }])
 * @example s.otherCustomers([{ id: "redeemer", paymentMethod: "success", distinctTestClock: true }])
 */
const otherCustomers = (customers: OtherCustomerConfig[]): ConfigFn => {
	return (config) => ({ ...config, otherCustomers: customers });
};

/**
 * Referral program. IDs auto-suffixed with productPrefix for isolation.
 * @example s.referralProgram({ reward: rewards.monthOff(), program: referralPrograms.onCheckoutReferrer({...}) })
 */
const referralProgramSetup = ({
	reward,
	program,
}: {
	reward: CreateReward;
	program: CreateRewardProgram;
}): ConfigFn => {
	return (config) => ({ ...config, referralProgram: { reward, program } });
};

/**
 * Reward/coupon. Reward ID auto-suffixed with productPrefix.
 * @example s.reward({ reward: constructCoupon({ id: "50-off", discountValue: 50, ... }), productId: "pro" })
 */
const rewardSetup = ({
	reward,
	productId,
}: {
	reward: CreateReward;
	productId: string;
}): ConfigFn => {
	return (config) => ({
		...config,
		rewards: [...config.rewards, { reward, productId }],
	});
};

/**
 * Attach a product to the customer or an entity. Product ID auto-prefixed.
 * @example s.attach({ productId: "pro" })
 * @example s.attach({ productId: "pro", entityIndex: 0 })
 * @example s.attach({ productId: "pro", options: [{ feature_id: "messages", quantity: 100 }] })
 */
const attach = ({
	productId,
	customerId,
	entityIndex,
	options,
	newBillingSubscription,
	timeout,
}: {
	productId: string;
	customerId?: string;
	entityIndex?: number;
	options?: FeatureOption[];
	newBillingSubscription?: boolean;
	timeout?: number;
}): ConfigFn => {
	const concurrency = Number(process.env.TEST_FILE_CONCURRENCY || "0");
	const defaultTimeout = concurrency > 1 ? 8000 : 4000;
	return (config) => ({
		...config,
		actions: [
			...config.actions,
			{
				type: "attach" as const,
				productId,
				customerId,
				entityIndex,
				options,
				newBillingSubscription,
				timeout: timeout ?? defaultTimeout,
			},
		],
	});
};

/**
 * Cancel a product subscription for the customer or an entity.
 * @example s.cancel({ productId: "pro" })
 * @example s.cancel({ productId: "pro", entityIndex: 0 })
 */
const cancel = ({
	productId,
	entityIndex,
}: {
	productId: string;
	entityIndex?: number;
}): ConfigFn => {
	return (config) => ({
		...config,
		actions: [
			...config.actions,
			{ type: "cancel" as const, productId, entityIndex },
		],
	});
};

/**
 * Advance the Stripe test clock. Successive calls chain from the previous endpoint.
 * @example s.advanceTestClock({ days: 15 })
 * @example s.advanceTestClock({ toNextInvoice: true })
 * @example s.advanceTestClock({ days: 8, waitForSeconds: 30 })
 */
const advanceTestClock = ({
	days,
	weeks,
	hours,
	months,
	toNextInvoice,
	waitForSeconds,
}: {
	days?: number;
	weeks?: number;
	hours?: number;
	months?: number;
	toNextInvoice?: boolean;
	waitForSeconds?: number;
}): ConfigFn => {
	return (config) => ({
		...config,
		actions: [
			...config.actions,
			{
				type: "advanceClock" as const,
				days,
				weeks,
				hours,
				months,
				toNextInvoice,
				waitForSeconds,
			},
		],
	});
};

/**
 * Attach/replace the customer's payment method. Useful for mid-scenario PM swaps.
 * @example s.attachPaymentMethod({ type: "authenticate" })
 */
const attachPaymentMethod = ({
	type,
}: {
	type: "success" | "fail" | "authenticate" | "alipay";
}): ConfigFn => {
	return (config) => ({
		...config,
		actions: [
			...config.actions,
			{
				type: "attachPaymentMethod" as const,
				paymentMethodType: type,
			},
		],
	});
};

/** Remove all of the customer's payment methods. */
const removePaymentMethod = (): ConfigFn => {
	return (config) => ({
		...config,
		actions: [
			...config.actions,
			{
				type: "removePaymentMethod" as const,
			},
		],
	});
};

/**
 * Track feature usage for the customer or an entity.
 * @example s.track({ featureId: TestFeature.Messages, value: 300 })
 * @example s.track({ featureId: TestFeature.Messages, value: 250, entityIndex: 0 })
 */
const track = ({
	featureId,
	value,
	entityIndex,
	timeout,
}: {
	featureId: string;
	value: number;
	entityIndex?: number;
	timeout?: number;
}): ConfigFn => {
	return (config) => ({
		...config,
		actions: [
			...config.actions,
			{
				type: "track" as const,
				featureId,
				value,
				entityIndex,
				timeout,
			},
		],
	});
};

/**
 * Update a subscription (cancel end-of-cycle, add items, etc.).
 * @example s.updateSubscription({ productId: "pro", cancelAction: "cancel_end_of_cycle" })
 * @example s.updateSubscription({ productId: "pro", items: [consumableItem] })
 */
const updateSubscription = ({
	productId,
	entityIndex,
	cancelAction,
	items,
}: {
	productId: string;
	entityIndex?: number;
	cancelAction?: "cancel_end_of_cycle" | "cancel_immediately" | "uncancel";
	items?: ProductItem[];
}): ConfigFn => {
	return (config) => ({
		...config,
		actions: [
			...config.actions,
			{
				type: "updateSubscription" as const,
				productId,
				entityIndex,
				cancelAction,
				items,
			},
		],
	});
};

/**
 * Advance the test clock to the next invoice cycle. `withPause` advances in
 * two steps (month boundary, then finalize).
 */
const advanceToNextInvoice = ({
	withPause,
}: {
	withPause?: boolean;
} = {}): ConfigFn => {
	return (config) => ({
		...config,
		actions: [
			...config.actions,
			{
				type: "advanceToNextInvoice" as const,
				withPause,
			},
		],
	});
};

/**
 * Reset a feature's usage cycle. Use for FREE products (no Stripe sub);
 * use s.advanceToNextInvoice() for PAID products.
 * @example s.resetFeature({ featureId: TestFeature.Messages })
 */
const resetFeature = ({
	featureId,
	timeout,
}: {
	featureId: string;
	timeout?: number;
}): ConfigFn => {
	return (config) => ({
		...config,
		actions: [
			...config.actions,
			{
				type: "resetFeature" as const,
				featureId,
				timeout,
			},
		],
	});
};

/**
 * Delete a customer before the test runs (silent if missing). Clears cache via API.
 * @example s.deleteCustomer({ customerId: "test-customer" })
 * @example s.deleteCustomer({ email: "test@example.com" })
 */
const deleteCustomer = (
	params: { customerId: string } | { email: string },
): ConfigFn => {
	return (config) => {
		if ("customerId" in params) {
			return {
				...config,
				cleanup: {
					...config.cleanup,
					customerIdsToDelete: [
						...config.cleanup.customerIdsToDelete,
						params.customerId,
					],
				},
			};
		}
		return {
			...config,
			cleanup: {
				...config.cleanup,
				emailsToDelete: [...config.cleanup.emailsToDelete, params.email],
			},
		};
	};
};

/**
 * Attach a product via /v1/billing.attach (V2). Product ID auto-prefixed.
 * Add-on lives on the product (`products.recurringAddOn()`), not here.
 * @example s.billing.attach({ productId: "pro" })
 * @example s.billing.attach({ productId: "pro", planSchedule: "end_of_cycle" })
 * @example s.billing.attach({ productId: "pro", items: [items.monthlyMessages({ includedUsage: 750 })] })
 */
const billingAttach = ({
	productId,
	customerId,
	entityIndex,
	options,
	licenseQuantities,
	newBillingSubscription,
	planSchedule,
	timeout,
	items,
	subscriptionId,
	invoice,
	enableProductImmediately,
	finalizeInvoice,
	billingControls,
}: {
	productId: string;
	customerId?: string;
	entityIndex?: number;
	options?: FeatureOption[];
	licenseQuantities?: { licenseProductId: string; quantity: number }[];
	newBillingSubscription?: boolean;
	planSchedule?: PlanTiming;
	timeout?: number;
	items?: ProductItem[];
	subscriptionId?: string;
	invoice?: boolean;
	enableProductImmediately?: boolean;
	finalizeInvoice?: boolean;
	billingControls?: CustomerBillingControlsParams;
}): ConfigFn => {
	const concurrency = Number(process.env.TEST_FILE_CONCURRENCY || "0");
	const defaultTimeout = concurrency > 1 ? 8000 : 5000;
	return (config) => ({
		...config,
		actions: [
			...config.actions,
			{
				type: "billingAttach" as const,
				productId,
				customerId,
				entityIndex,
				options,
				licenseQuantities,
				newBillingSubscription,
				planSchedule,
				timeout: timeout ?? defaultTimeout,
				items,
				subscriptionId,
				invoice,
				enableProductImmediately,
				finalizeInvoice,
				billingControls,
			},
		],
	});
};

/**
 * Multi-attach via /billing.multi_attach.
 * @example s.billing.multiAttach({ plans: [{ productId: "pro" }, { productId: "addon" }] })
 */
const billingMultiAttach = ({
	plans,
	entityIndex,
	freeTrial,
	timeout,
}: {
	plans: MultiAttachPlan[];
	entityIndex?: number;
	freeTrial?: { length: number; duration: string; card_required?: boolean };
	timeout?: number;
}): ConfigFn => {
	const concurrency = Number(process.env.TEST_FILE_CONCURRENCY || "0");
	const defaultTimeout = concurrency > 1 ? 5000 : 2000;
	return (config) => ({
		...config,
		actions: [
			...config.actions,
			{
				type: "billingMultiAttach" as const,
				plans,
				entityIndex,
				freeTrial,
				timeout: timeout ?? defaultTimeout,
			},
		],
	});
};

/** Top-level alias for billing multi-attach. */
const multiAttach = billingMultiAttach;

const linkLicense =
	({
		parentProductId,
		licenseProductId,
		included,
		prepaidOnly,
		metadata,
	}: {
		parentProductId: string;
		licenseProductId: string;
		included: number;
		prepaidOnly?: boolean;
		metadata?: Record<string, unknown>;
	}): ConfigFn =>
	(config) => ({
		...config,
		actions: [
			...config.actions,
			{
				type: "linkLicense" as const,
				parentProductId,
				licenseProductId,
				included,
				prepaidOnly,
				metadata,
			},
		],
	});

const assignLicense =
	({
		licenseProductId,
		entityIndex,
		entityIndexes,
		parentProductId,
	}: {
		licenseProductId: string;
		entityIndex?: number;
		entityIndexes?: number[];
		parentProductId?: string;
	}): ConfigFn =>
	(config) => ({
		...config,
		actions: [
			...config.actions,
			{
				type: "assignLicense" as const,
				licenseProductId,
				entityIndex,
				entityIndexes,
				parentProductId,
			},
		],
	});

/** Run independent scenario actions concurrently. */
const parallel = (...actions: ConfigFn[]): ConfigFn => {
	return (config) => {
		const parallelConfig = actions.reduce((c, fn) => fn(c), {
			...config,
			actions: [],
		} as ScenarioConfig);

		return {
			...config,
			actions: [
				...config.actions,
				{ type: "parallel" as const, actions: parallelConfig.actions },
			],
		};
	};
};

/**
 * Define a feature grant reward for this test scenario.
 * Inserts a reward of type `feature_grant` with entitlements and promo codes.
 * Feature IDs are external (e.g., TestFeature.Messages) and resolved to internal IDs during setup.
 * @param config - Feature grant configuration
 */
const featureGrant = (config: FeatureGrantConfig): ConfigFn => {
	return (scenarioConfig) => ({
		...scenarioConfig,
		featureGrants: [...scenarioConfig.featureGrants, config],
	});
};

/**
 * Redeem a reward promo code for a customer.
 * @param code - The promo code to redeem
 * @param customerId - Optional: use this customer instead of primary
 */
const redeemReward = ({
	code,
	customerId,
}: {
	code: string;
	customerId?: string;
}): ConfigFn => {
	return (config) => ({
		...config,
		actions: [
			...config.actions,
			{ type: "redeemReward" as const, code, customerId },
		],
	});
};

// ═══════════════════════════════════════════════════════════════════
// REFERRAL ACTIONS
// ═══════════════════════════════════════════════════════════════════

/** Create a referral code (requires s.referralProgram()). */
const createReferralCode = (): ConfigFn => {
	return (config) => ({
		...config,
		actions: [...config.actions, { type: "createReferralCode" as const }],
	});
};

/** Redeem the referral code for `customerId` (requires s.referral.createCode() first). */
const redeemReferralCode = ({
	customerId,
}: {
	customerId: string;
}): ConfigFn => {
	return (config) => ({
		...config,
		actions: [
			...config.actions,
			{ type: "redeemReferralCode" as const, customerId },
		],
	});
};

/** Create code on primary, redeem for `customerId` in one step. */
const createAndRedeemReferralCode = ({
	customerId,
}: {
	customerId: string;
}): ConfigFn => {
	return (config) => ({
		...config,
		actions: [
			...config.actions,
			{ type: "createAndRedeemReferralCode" as const, customerId },
		],
	});
};

/**
 * Provision a fresh platform sub-org via `POST /platform/organizations` and
 * rebind ctx to it for the rest of the scenario. Use to isolate tests that
 * mutate org-level config.
 *
 * Sub-orgs are NOT auto-cleaned; `bun cm` runs `clearMasterOrg` to delete
 * them. Slugs are randomized by default to avoid collisions.
 *
 * @param slug - Sub-org slug; defaults to randomized "tax-XXXXXX".
 * @param name - Display name; defaults to slug.
 * @param userEmail - Owner email; defaults to "platform-tests@autumn.test".
 * @param configOverrides - Merged into the sub-org's config jsonb.
 * @param taxRegistrations - Countries to register Stripe Tax for.
 * @param setupDefaultFeatures - Inserts standard test features on the sub-org.
 *
 * @example s.platform.create({ configOverrides: { automatic_tax: true }, taxRegistrations: ["AU"] })
 */
const platformCreate = (cfg: PlatformCreateConfig = {}): ConfigFn => {
	return (config) => ({
		...config,
		platformConfig: cfg,
	});
};

/** Scenario configuration functions for use with `initScenario`. */
export const s = {
	customer,
	otherCustomers,
	products,
	entities,
	referralProgram: referralProgramSetup,
	reward: rewardSetup,
	attach,
	cancel,
	advanceTestClock,
	advanceToNextInvoice,
	attachPaymentMethod,
	removePaymentMethod,
	track,
	updateSubscription,
	deleteCustomer,
	resetFeature,
	billing: {
		attach: billingAttach,
		multiAttach: billingMultiAttach,
	},
	licenses: {
		link: linkLicense,
		assign: assignLicense,
	},
	multiAttach,
	parallel,
	featureGrant,
	referral: {
		createCode: createReferralCode,
		redeem: redeemReferralCode,
		createAndRedeem: createAndRedeemReferralCode,
	},
	platform: {
		create: platformCreate,
	},
	rewards: {
		redeem: redeemReward,
	},
} as const;

// ═══════════════════════════════════════════════════════════════════
// INIT SCENARIO
// ═══════════════════════════════════════════════════════════════════

const defaultConfig: ScenarioConfig = {
	testClock: false,
	withDefault: false,
	defaultGroup: undefined,
	products: [],
	productPrefix: undefined,
	cleanup: {
		customerIdsToDelete: [],
		emailsToDelete: [],
	},
	actions: [],
	otherCustomers: [],
	referralProgram: undefined,
	rewards: [],
	featureGrants: [],
};

/**
 * Build a test scenario from setup/actions config functions. Customer
 * creation is skipped when `customerId` is omitted (useful for null-id tests).
 * Actions execute in array order.
 *
 * @example
 * ```typescript
 * const { autumnV1, ctx } = await initScenario({
 *   customerId: "simple-test",
 *   setup: [s.customer({ paymentMethod: "success" }), s.products({ list: [free] })],
 *   actions: [s.attach({ productId: "base" })],
 * });
 * ```
 */
type OtherCustomerResult = {
	id: string;
	customer: Awaited<ReturnType<typeof initCustomerV3>>["customer"];
};

type InitScenarioImplementationResult = {
	customerId: string | undefined;
	autumnV0: AutumnInt;
	autumnV1: AutumnInt;
	autumnV1Beta: AutumnInt;
	/** @deprecated Use autumnV2_2 instead */
	autumnV2: AutumnInt;
	/** @deprecated Use autumnV2_2 instead */
	autumnV2_1: AutumnInt;
	autumnV2_2: AutumnInt;
	autumnV2_3: AutumnInt;
	testClockId: string | undefined;
	testClockIds: Record<string, string>;
	customer: Awaited<ReturnType<typeof initCustomerV3>>["customer"] | null;
	ctx: TestContext;
	entities: GeneratedEntity[];
	licenseAssignments: GeneratedLicenseAssignment[];
	advancedTo: number;
	otherCustomers: Map<string, OtherCustomerResult>;
	referralCode: ReferralCode | null;
	redemption: RewardRedemption | null;
};

// customerId provided -> customerId: string in return.
export async function initScenario(params: {
	customerId: string;
	setup: ConfigFn[];
	actions: ConfigFn[];
	ctx?: TestContext;
}): Promise<{
	customerId: string;
	autumnV0: AutumnInt;
	autumnV1: AutumnInt;
	autumnV1Beta: AutumnInt;
	/** @deprecated Use autumnV2_2 instead */
	autumnV2: AutumnInt;
	/** @deprecated Use autumnV2_2 instead */
	autumnV2_1: AutumnInt;
	autumnV2_2: AutumnInt;
	autumnV2_3: AutumnInt;
	testClockId: string | undefined;
	testClockIds: Record<string, string>;
	customer: Awaited<ReturnType<typeof initCustomerV3>>["customer"];
	ctx: TestContext;
	entities: GeneratedEntity[];
	licenseAssignments: GeneratedLicenseAssignment[];
	advancedTo: number;
	otherCustomers: Map<string, OtherCustomerResult>;
	referralCode: ReferralCode | null;
	redemption: RewardRedemption | null;
}>;

// customerId omitted -> customerId: undefined in return.
export async function initScenario(params: {
	customerId?: undefined;
	setup: ConfigFn[];
	actions: ConfigFn[];
	ctx?: TestContext;
}): Promise<{
	customerId: undefined;
	autumnV0: AutumnInt;
	autumnV1: AutumnInt;
	autumnV1Beta: AutumnInt;
	/** @deprecated Use autumnV2_2 instead */
	autumnV2: AutumnInt;
	/** @deprecated Use autumnV2_2 instead */
	autumnV2_1: AutumnInt;
	autumnV2_2: AutumnInt;
	autumnV2_3: AutumnInt;
	testClockId: undefined;
	testClockIds: Record<string, string>;
	customer: null;
	ctx: TestContext;
	entities: GeneratedEntity[];
	licenseAssignments: GeneratedLicenseAssignment[];
	advancedTo: number;
	otherCustomers: Map<string, OtherCustomerResult>;
	referralCode: ReferralCode | null;
	redemption: RewardRedemption | null;
}>;

export async function initScenario({
	customerId,
	setup,
	actions,
	ctx: ctxOverride,
}: {
	customerId?: string;
	setup: ConfigFn[];
	actions: ConfigFn[];
	ctx?: TestContext;
}): Promise<InitScenarioImplementationResult> {
	// Use override or default ctx; may be rebound below if s.platform.create.
	let ctx = ctxOverride ?? defaultCtx;
	const config = [...setup, ...actions].reduce((c, fn) => fn(c), defaultConfig);

	// Sub-org provisioning runs first so subsequent setup hits the sub-org.
	if (config.platformConfig) {
		const masterAutumn = new AutumnInt({ secretKey: ctx.orgSecretKey });

		const slug =
			config.platformConfig.slug ??
			`tax-${Math.random().toString(36).slice(2, 8)}`;
		const userEmail =
			config.platformConfig.userEmail ?? "platform-tests@autumn.test";
		const name = config.platformConfig.name ?? slug;

		const response = (await masterAutumn.post("/platform/organizations", {
			user_email: userEmail,
			name,
			slug,
			env: "test",
		})) as {
			test_secret_key: string;
			live_secret_key?: string;
			org_slug: string;
		};

		ctx = await createSubOrgTestContext({
			subOrgSlug: response.org_slug,
			testSecretKey: response.test_secret_key,
			configOverrides: config.platformConfig.configOverrides,
			taxRegistrations: config.platformConfig.taxRegistrations,
			setupDefaultFeatures: config.platformConfig.setupDefaultFeatures,
		});

		console.log(
			"[TEST] Creating sub-org:",
			slug,
			" | Impersonate via: ",
			`${process.env.AUTUMN_TEST_VITE_URL ?? "http://localhost:3000"}/impersonate-redirect?org_id=${ctx.org.id}`,
		);
	}

	// Generate entities from config
	const generatedEntities = config.entityConfig
		? generateEntities(config.entityConfig)
		: [];

	// Create a cleanup autumn client
	const cleanupAutumn = new AutumnInt({
		version: ApiVersion.V1_2,
		secretKey: ctx.orgSecretKey,
	});

	// 0. Run cleanup - delete customers by ID and email before test
	for (const customerIdToDelete of config.cleanup.customerIdsToDelete) {
		try {
			await cleanupAutumn.customers.delete(customerIdToDelete);
		} catch {}
	}

	for (const emailToDelete of config.cleanup.emailsToDelete) {
		const customers = await CusService.getByEmail({
			db: ctx.db,
			email: emailToDelete,
			orgId: ctx.org.id,
			env: ctx.env,
		});

		for (const customerToDelete of customers) {
			try {
				await cleanupAutumn.customers.delete(customerToDelete.internal_id);
			} catch {}
		}
	}

	// 1. Products + previous-customer cleanup. Prefix priority:
	// productPrefix > customerId > "shared".
	const productPrefix = config.productPrefix ?? customerId ?? "shared";

	const otherCustomerIds = config.otherCustomers.map((c) => c.id);
	const allCustomerIds = config.customerIds ?? [
		...(customerId ? [customerId] : []),
		...otherCustomerIds,
	];

	if (config.products.length > 0) {
		await initProductsV0({
			ctx,
			products: config.products,
			prefix: productPrefix,
			customerIds: allCustomerIds,
			createInStripe: config.productCreateInStripe,
		});
	}

	// 1.5. Referral program. Suffix IDs with productPrefix for isolation.
	if (config.referralProgram) {
		const { reward, program } = config.referralProgram;

		// Suffix reward ID and free_product_id (if set)
		reward.id = `${reward.id}_${productPrefix}`;
		if (reward.free_product_id) {
			reward.free_product_id = `${reward.free_product_id}_${productPrefix}`;
		}

		program.id = `${program.id}_${productPrefix}`;
		program.internal_reward_id = reward.id;

		if (program.product_ids && program.product_ids.length > 0) {
			program.product_ids = program.product_ids.map(
				(pid) => `${pid}_${productPrefix}`,
			);
		}

		await createReferralProgram({
			db: ctx.db,
			orgId: ctx.org.id,
			env: ctx.env,
			autumn: cleanupAutumn,
			reward,
			rewardProgram: program,
		});
	}

	// 1.6. Standalone rewards. Suffix IDs with productPrefix.
	for (const rewardConfig of config.rewards) {
		const { reward, productId } = rewardConfig;

		reward.id = `${reward.id}_${productPrefix}`;
		const prefixedProductId = `${productId}_${productPrefix}`;

		await createReward({
			db: ctx.db,
			orgId: ctx.org.id,
			env: ctx.env,
			autumn: cleanupAutumn,
			reward,
			productId: prefixedProductId,
		});
	}

	// 1.7. Insert feature grant rewards (if configured)
	for (const fg of config.featureGrants) {
		const rewardId = fg.id ?? `feature-grant-${Date.now()}`;

		// Resolve external feature_ids to internal_feature_ids
		const resolvedEntitlements: RewardEntitlement[] = fg.entitlements.map(
			(ent) => {
				const feature = ctx.features.find((f) => f.id === ent.feature_id);
				if (!feature) {
					throw new Error(
						`Feature "${ent.feature_id}" not found in ctx.features for feature grant reward`,
					);
				}
				return {
					internal_feature_id: feature.internal_id!,
					allowance: ent.allowance,
					expiry: ent.expiry,
				};
			},
		);

		await rewardRepo.insert({
			db: ctx.db,
			data: {
				internal_id: generateId("rew"),
				id: rewardId,
				org_id: ctx.org.id,
				env: ctx.env,
				type: RewardType.FeatureGrant,
				name: fg.name ?? rewardId,
				entitlements: resolvedEntitlements,
				promo_codes: fg.promoCodes.map((pc) => ({
					code: pc.code,
					max_redemptions: pc.max_redemptions,
					first_time_transaction: pc.first_time_transaction,
				})),
				created_at: Date.now(),
			},
		});
	}

	// 2. Initialize customer (only if customerId is provided)
	let testClockId: string | undefined;
	let customer: Awaited<ReturnType<typeof initCustomerV3>>["customer"] | null =
		null;

	if (customerId) {
		const result = await initCustomerV3({
			ctx,
			customerId,
			customerData: config.customerData,
			attachPm: config.attachPm,
			withTestClock: config.testClock,
			withDefault: config.withDefault ?? false,
			// Default group matches the product prefix used in initProductsV0.
			defaultGroup: config.defaultGroup ?? customerId,
			skipWebhooks: config.skipWebhooks,
			sendEmailReceipts: config.sendEmailReceipts,
			nameOverride: config.nameOverride,
			emailOverride: config.emailOverride,
			stripeCustomerOverrides: config.stripeCustomerOverrides,
		});
		testClockId = result.testClockId;
		customer = result.customer;
	}

	// 2.5. Initialize other customers (share test clock with primary customer unless distinctTestClock is set)
	const otherCustomersMap = new Map<string, OtherCustomerResult>();
	const testClockIds: Record<string, string> = {};
	if (testClockId && customerId) {
		testClockIds[customerId] = testClockId;
	}
	for (const otherCusConfig of config.otherCustomers) {
		const useDistinctClock = otherCusConfig.distinctTestClock === true;
		const otherResult = await initCustomerV3({
			ctx,
			customerId: otherCusConfig.id,
			customerData: otherCusConfig.data,
			attachPm: otherCusConfig.paymentMethod,
			withTestClock: useDistinctClock,
			...(!useDistinctClock && testClockId
				? { existingTestClockId: testClockId }
				: {}),
			withDefault: false,
			defaultGroup: productPrefix,
			skipWebhooks: config.skipWebhooks,
		});
		otherCustomersMap.set(otherCusConfig.id, {
			id: otherCusConfig.id,
			customer: otherResult.customer,
		});
		if (otherResult.testClockId) {
			testClockIds[otherCusConfig.id] = otherResult.testClockId;
		}
	}

	// 3. Create autumn clients
	const autumnV0 = new AutumnInt({
		version: ApiVersion.V0_2,
		secretKey: ctx.orgSecretKey,
	});

	const autumnV1 = new AutumnInt({
		version: ApiVersion.V1_2,
		secretKey: ctx.orgSecretKey,
	});

	const autumnV1Beta = new AutumnInt({
		version: ApiVersion.V1_Beta,
		secretKey: ctx.orgSecretKey,
	});

	const autumnV2 = new AutumnInt({
		version: ApiVersion.V2_0,
		secretKey: ctx.orgSecretKey,
	});

	const autumnV2_1 = new AutumnInt({
		version: ApiVersion.V2_1,
		secretKey: ctx.orgSecretKey,
	});
	const autumnV2_2 = new AutumnInt({
		version: ApiVersion.V2_2,
		secretKey: ctx.orgSecretKey,
	});
	const autumnV2_3 = new AutumnInt({
		version: ApiVersion.V2_3,
		secretKey: ctx.orgSecretKey,
	});

	// 4. Entities (requires customerId).
	if (generatedEntities.length > 0) {
		if (!customerId) {
			throw new Error(
				"Cannot create entities: customerId is required when using s.entities()",
			);
		}
		const defaultGroup = config.entityConfig?.defaultGroup;
		const entityDefs = generatedEntities.map((e) => ({
			id: e.id,
			name: e.name,
			feature_id: e.featureId,
			...(defaultGroup && {
				customer_data: {
					internal_options: {
						default_group: defaultGroup,
					},
				},
			}),
		}));
		await autumnV1.entities.create(customerId, entityDefs);
	}

	// 5. Run actions in order.
	let advancedTo: number = Date.now();
	const licenseAssignments: GeneratedLicenseAssignment[] = [];
	// plans.update takes the complete link set, so sequential link actions on
	// the same parent accumulate here instead of clobbering earlier links.
	const catalogLinksByParent = new Map<string, Record<string, unknown>[]>();
	let referralCode: ReferralCode | null = null;
	let redemption: RewardRedemption | null = null;

	const runAction = async (action: ScenarioAction): Promise<void> => {
		if (action.type === "parallel") {
			await Promise.all(action.actions.map((child) => runAction(child)));
		} else if (action.type === "attach") {
			// Override or fall back to primary customerId.
			const targetCustomerId = action.customerId ?? customerId;
			if (!targetCustomerId) {
				throw new Error(
					"Cannot attach product: customerId is required when using s.attach()",
				);
			}
			const prefixedProductId = `${action.productId}_${productPrefix}`;

			let entityId: string | undefined;
			if (action.entityIndex !== undefined) {
				if (action.entityIndex >= generatedEntities.length) {
					throw new Error(
						`entityIndex ${action.entityIndex} is out of bounds. Only ${generatedEntities.length} entities configured.`,
					);
				}
				entityId = generatedEntities[action.entityIndex].id;
			}

			await autumnV1.attach({
				customer_id: targetCustomerId,
				product_id: prefixedProductId,
				entity_id: entityId,
				options: action.options,
				new_billing_subscription: action.newBillingSubscription,
			});
			if (action.timeout) {
				await new Promise((resolve) => setTimeout(resolve, action.timeout));
			}
		} else if (action.type === "cancel") {
			if (!customerId) {
				throw new Error(
					"Cannot cancel product: customerId is required when using s.cancel()",
				);
			}
			const prefixedProductId = `${action.productId}_${productPrefix}`;

			let entityId: string | undefined;
			if (action.entityIndex !== undefined) {
				if (action.entityIndex >= generatedEntities.length) {
					throw new Error(
						`entityIndex ${action.entityIndex} is out of bounds. Only ${generatedEntities.length} entities configured.`,
					);
				}
				entityId = generatedEntities[action.entityIndex].id;
			}

			await autumnV1.cancel({
				customer_id: customerId,
				product_id: prefixedProductId,
				entity_id: entityId,
			});
		} else if (action.type === "advanceClock") {
			if (!testClockId) {
				throw new Error(
					"Cannot advance test clock: testClock not enabled in customer config",
				);
			}

			const startingFrom = new Date(advancedTo);

			if (action.toNextInvoice) {
				// Advance to next month + hours to finalize invoice
				const baseDate = startingFrom ?? new Date();
				advancedTo = await advanceTestClockFn({
					stripeCli: ctx.stripeCli,
					testClockId,
					advanceTo: addHours(
						addMonths(baseDate, 1),
						hoursToFinalizeInvoice,
					).getTime(),
					waitForSeconds: 30,
				});
			} else {
				advancedTo = await advanceTestClockFn({
					stripeCli: ctx.stripeCli,
					testClockId,
					startingFrom,
					numberOfDays: action.days,
					numberOfWeeks: action.weeks,
					numberOfHours: action.hours,
					numberOfMonths: action.months,
					waitForSeconds: action.waitForSeconds,
				});
			}
		} else if (action.type === "attachPaymentMethod") {
			const stripeCusId = customer?.processor?.id;
			if (!stripeCusId) {
				throw new Error(
					"Cannot attach payment method: customer has no Stripe ID",
				);
			}
			await attachPaymentMethodFn({
				stripeCli: ctx.stripeCli,
				stripeCusId,
				type: action.paymentMethodType,
			});
		} else if (action.type === "removePaymentMethod") {
			const stripeCusId = customer?.processor?.id;
			if (!stripeCusId) {
				throw new Error(
					"Cannot remove payment method: customer has no Stripe ID",
				);
			}
			await removeAllPaymentMethods({
				stripeClient: ctx.stripeCli,
				stripeCustomerId: stripeCusId,
			});
		} else if (action.type === "track") {
			if (!customerId) {
				throw new Error(
					"Cannot track usage: customerId is required when using s.track()",
				);
			}

			let entityId: string | undefined;
			if (action.entityIndex !== undefined) {
				if (action.entityIndex >= generatedEntities.length) {
					throw new Error(
						`entityIndex ${action.entityIndex} is out of bounds. Only ${generatedEntities.length} entities configured.`,
					);
				}
				entityId = generatedEntities[action.entityIndex].id;
			}

			await autumnV1.track({
				customer_id: customerId,
				feature_id: action.featureId,
				value: action.value,
				entity_id: entityId,
			});
			if (action.timeout) {
				await new Promise((resolve) => setTimeout(resolve, action.timeout));
			}
		} else if (action.type === "updateSubscription") {
			if (!customerId) {
				throw new Error(
					"Cannot update subscription: customerId is required when using s.updateSubscription()",
				);
			}
			const prefixedProductId = `${action.productId}_${productPrefix}`;

			let entityId: string | undefined;
			if (action.entityIndex !== undefined) {
				if (action.entityIndex >= generatedEntities.length) {
					throw new Error(
						`entityIndex ${action.entityIndex} is out of bounds. Only ${generatedEntities.length} entities configured.`,
					);
				}
				entityId = generatedEntities[action.entityIndex].id;
			}

			await autumnV1.subscriptions.update({
				customer_id: customerId,
				product_id: prefixedProductId,
				entity_id: entityId,
				cancel_action: action.cancelAction,
				items: action.items,
			});
		} else if (action.type === "advanceToNextInvoice") {
			if (!testClockId) {
				throw new Error(
					"Cannot advance to next invoice: testClock not enabled in customer config",
				);
			}

			const startingFrom = new Date(advancedTo);
			if (action.withPause) {
				advancedTo = await advanceTestClockFn({
					stripeCli: ctx.stripeCli,
					testClockId,
					advanceTo: addMonths(startingFrom, 1).getTime(),
					waitForSeconds: 15,
				});
				await advanceTestClockFn({
					stripeCli: ctx.stripeCli,
					testClockId,
					advanceTo: addHours(advancedTo, hoursToFinalizeInvoice).getTime(),
					waitForSeconds: 15,
				});
			} else {
				advancedTo = await advanceTestClockFn({
					stripeCli: ctx.stripeCli,
					testClockId,
					advanceTo: addHours(
						addMonths(startingFrom, 1),
						hoursToFinalizeInvoice,
					).getTime(),
					waitForSeconds: 30,
				});
			}
		} else if (action.type === "billingAttach") {
			// Override or fall back to primary customerId.
			const targetCustomerId = action.customerId ?? customerId;
			if (!targetCustomerId) {
				throw new Error(
					"Cannot attach product: customerId is required when using s.billing.attach()",
				);
			}
			const prefixedProductId = `${action.productId}_${productPrefix}`;

			let entityId: string | undefined;
			if (action.entityIndex !== undefined) {
				if (action.entityIndex >= generatedEntities.length) {
					throw new Error(
						`entityIndex ${action.entityIndex} is out of bounds. Only ${generatedEntities.length} entities configured.`,
					);
				}
				entityId = generatedEntities[action.entityIndex].id;
			}

			await autumnV1.billing.attach(
				{
					customer_id: targetCustomerId,
					product_id: prefixedProductId,
					entity_id: entityId,
					options: action.options,
					license_quantities: action.licenseQuantities?.map(
						({ licenseProductId, quantity }) => ({
							license_plan_id: `${licenseProductId}_${productPrefix}`,
							quantity,
						}),
					),
					new_billing_subscription: action.newBillingSubscription,
					plan_schedule: action.planSchedule,
					items: action.items,
					subscription_id: action.subscriptionId,
					invoice: action.invoice,
					enable_product_immediately: action.enableProductImmediately,
					finalize_invoice: action.finalizeInvoice,
					billing_controls: action.billingControls,
				},
				{ timeout: action.timeout },
			);
		} else if (action.type === "billingMultiAttach") {
			if (!customerId) {
				throw new Error(
					"Cannot multi-attach: customerId is required when using s.billing.multiAttach()",
				);
			}

			let entityId: string | undefined;
			if (action.entityIndex !== undefined) {
				if (action.entityIndex >= generatedEntities.length) {
					throw new Error(
						`entityIndex ${action.entityIndex} is out of bounds. Only ${generatedEntities.length} entities configured.`,
					);
				}
				entityId = generatedEntities[action.entityIndex].id;
			}

			// Build plans with prefixed product IDs
			const plans = action.plans.map((plan) => ({
				plan_id: `${plan.productId}_${productPrefix}`,
				feature_quantities: plan.featureQuantities?.map((fq) => ({
					feature_id: fq.feature_id,
					quantity: fq.quantity,
				})),
				version: plan.version,
			}));

			await autumnV1.billing.multiAttach(
				{
					customer_id: customerId,
					entity_id: entityId,
					plans,
					free_trial: action.freeTrial,
				},
				{ timeout: action.timeout },
			);
		} else if (action.type === "linkLicense") {
			const parentPlanId = `${action.parentProductId}_${productPrefix}`;
			const entry = {
				license_plan_id: `${action.licenseProductId}_${productPrefix}`,
				included: action.included,
				prepaid_only: action.prepaidOnly,
				metadata: action.metadata,
			};
			const links = (catalogLinksByParent.get(parentPlanId) ?? []).filter(
				(link) => link.license_plan_id !== entry.license_plan_id,
			);
			links.push(entry);
			catalogLinksByParent.set(parentPlanId, links);
			await autumnV2_2.post("/plans.update", {
				plan_id: parentPlanId,
				licenses: links,
			});
		} else if (action.type === "assignLicense") {
			if (!customerId) {
				throw new Error(
					"Cannot assign license: customerId is required when using s.licenses.assign()",
				);
			}
			const entityIndexes =
				action.entityIndexes ??
				(action.entityIndex !== undefined ? [action.entityIndex] : []);
			if (entityIndexes.length === 0) {
				throw new Error(
					"s.licenses.assign() requires entityIndex or entityIndexes",
				);
			}
			for (const index of entityIndexes) {
				if (index >= generatedEntities.length) {
					throw new Error(
						`entityIndex ${index} is out of bounds. Only ${generatedEntities.length} entities configured.`,
					);
				}
			}
			const entityIds = entityIndexes.map(
				(index) => generatedEntities[index].id,
			);
			const licensePlanId = `${action.licenseProductId}_${productPrefix}`;
			await autumnV2_2.post("/licenses.attach", {
				customer_id: customerId,
				plan_id: licensePlanId,
				entities: entityIds.map((entityId) => ({ entity_id: entityId })),
			});
			const { list } = (await autumnV2_2.post("/licenses.list_assignments", {
				customer_id: customerId,
				plan_id: licensePlanId,
				active: true,
			})) as { list: GeneratedLicenseAssignment[] };
			const assignedIds = new Set(entityIds);
			licenseAssignments.push(
				...list.filter((assignment) => assignedIds.has(assignment.entity_id)),
			);
		} else if (action.type === "createReferralCode") {
			if (!customerId) {
				throw new Error("Cannot create referral code: customerId is required");
			}
			if (!config.referralProgram) {
				throw new Error(
					"Cannot create referral code: s.referralProgram() must be configured in setup",
				);
			}
			referralCode = await autumnV1.referrals.createCode({
				customerId,
				referralId: config.referralProgram.program.id,
			});
		} else if (action.type === "redeemReferralCode") {
			if (!referralCode) {
				throw new Error(
					"Cannot redeem referral code: s.referral.createCode() must be called first",
				);
			}
			redemption = await autumnV1.referrals.redeem({
				customerId: action.customerId,
				code: referralCode.code,
			});
		} else if (action.type === "createAndRedeemReferralCode") {
			if (!customerId) {
				throw new Error("Cannot create referral code: customerId is required");
			}
			if (!config.referralProgram) {
				throw new Error(
					"Cannot create referral code: s.referralProgram() must be configured in setup",
				);
			}
			// Create code for primary customer
			const createdCode = await autumnV1.referrals.createCode({
				customerId,
				referralId: config.referralProgram.program.id,
			});
			referralCode = createdCode;
			// Redeem for specified customer
			redemption = await autumnV1.referrals.redeem({
				customerId: action.customerId,
				code: createdCode.code,
			});
		} else if (action.type === "resetFeature") {
			if (!customerId) {
				throw new Error(
					"Cannot reset feature: customerId is required when using s.resetFeature()",
				);
			}
			if (!customer) {
				throw new Error(
					"Cannot reset feature: customer not initialized. Ensure s.customer() is in setup.",
				);
			}

			// Product group is always productPrefix; productId param is unused.
			const productGroup = productPrefix;

			await resetAndGetCusEnt({
				ctx,
				customer,
				productGroup,
				featureId: action.featureId,
			});

			// Wait for cache to clear.
			const waitTime = action.timeout ?? 2000;
			await new Promise((resolve) => setTimeout(resolve, waitTime));
		} else if (action.type === "redeemReward") {
			const targetCustomerId = action.customerId ?? customerId;
			if (!targetCustomerId) {
				throw new Error(
					"Cannot redeem reward: customerId is required when using s.rewards.redeem()",
				);
			}
			await autumnV1.rewards.redeem({
				code: action.code,
				customerId: targetCustomerId,
			});
		}
	};

	for (const action of config.actions) {
		await runAction(action);
	}

	return {
		customerId,
		autumnV0,
		autumnV1,
		autumnV1Beta,
		autumnV2,
		autumnV2_1,
		autumnV2_2,
		autumnV2_3,
		testClockId,
		testClockIds,
		customer,
		ctx,
		entities: generatedEntities,
		licenseAssignments,
		advancedTo,
		otherCustomers: otherCustomersMap,
		referralCode,
		redemption,
	};
}
