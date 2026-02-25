import {
	ApiVersion,
	type CreateReward,
	type CreateRewardProgram,
	type PlanTiming,
	type ProductItem,
	type ProductV2,
	type ReferralCode,
	type RewardRedemption,
} from "@autumn/shared";
import { resetAndGetCusEnt } from "@tests/balances/track/rollovers/rolloverTestUtils.js";
import type { CustomerData } from "autumn-js";
import { addHours, addMonths } from "date-fns";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { removeAllPaymentMethods } from "@/external/stripe/customers/paymentMethods/operations/removeAllPaymentMethods.js";
import { CusService } from "@/internal/customers/CusService.js";
import { attachPaymentMethod as attachPaymentMethodFn } from "@/utils/scriptUtils/initCustomer.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";
import { hoursToFinalizeInvoice } from "../constants.js";
import { createReferralProgram, createReward } from "../productUtils.js";
import { advanceTestClock as advanceTestClockFn } from "../stripeUtils.js";
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
};

type GeneratedEntity = {
	id: string;
	name: string;
	featureId: string;
};

type OtherCustomerConfig = {
	id: string;
	paymentMethod?: "success" | "fail" | "authenticate" | "alipay";
	data?: CustomerData;
};

type ReferralProgramConfig = {
	reward: CreateReward;
	program: CreateRewardProgram;
};

type RewardConfig = {
	reward: CreateReward;
	productId: string;
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
	newBillingSubscription?: boolean;
	planSchedule?: PlanTiming;
	timeout?: number;
	items?: ProductItem[]; // Custom product items (creates is_custom product)
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
	| CreateReferralCodeAction
	| RedeemReferralCodeAction
	| CreateAndRedeemReferralCodeAction
	| ResetFeatureAction;

type CleanupConfig = {
	customerIdsToDelete: string[];
	emailsToDelete: string[];
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
	products: ProductV2[];
	productPrefix?: string;
	entityConfig?: EntityConfig;
	customerIds?: string[];
	cleanup: CleanupConfig;
	actions: ScenarioAction[];
	otherCustomers: OtherCustomerConfig[];
	referralProgram?: ReferralProgramConfig;
	rewards: RewardConfig[];
};

type ConfigFn = (config: ScenarioConfig) => ScenarioConfig;

// ═══════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════

/**
 * Generate entity definitions from count and featureId.
 * Creates entities with ids "ent-1", "ent-2", etc.
 */
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
 * Configure customer options: test clock, payment method, customer data, and default product.
 * @param testClock - Enable Stripe test clock for time manipulation (default: true)
 * @param paymentMethod - Attach payment method: "success", "fail", or "authenticate"
 * @param data - Customer metadata (fingerprint, name, email, etc.)
 * @param withDefault - Attach the default product on creation (default: false)
 * @param defaultGroup - The product group to use for default product selection
 * @param skipWebhooks - Skip sending webhooks for this customer creation (default: undefined, uses server default)
 * @param send_email_receipts - Whether to send email receipts to the customer
 * @param name - Override customer name (pass null for no name, undefined to use default)
 * @param email - Override customer email (pass null for no email, undefined to use default)
 * @example s.customer({ paymentMethod: "success" })
 * @example s.customer({ paymentMethod: "success", data: { name: "Test" } })
 * @example s.customer({ withDefault: true, defaultGroup: "enterprise" })
 * @example s.customer({ withDefault: true, skipWebhooks: false }) // Enable webhooks for testing
 * @example s.customer({ paymentMethod: "success", send_email_receipts: true })
 * @example s.customer({ name: null, email: null }) // Customer with no name or email
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
}): ConfigFn => {
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
	});
};

/**
 * Define products to create for this test scenario.
 * Products are prefixed with customerId for test isolation.
 * @param list - Array of ProductV2 objects
 * @param prefix - Optional custom prefix for product IDs (defaults to customerId or "shared")
 * @param customerIdsToDelete - Array of customer IDs to delete before creating products
 * @example s.products({ list: [pro, free] })
 * @example s.products({ list: [freeDefault], prefix: "my-prefix" }) // custom prefix when no customerId
 * @example s.products({ list: [pro, free], customerIdsToDelete: [customerId] })
 */
const products = ({
	list,
	prefix,
	customerIdsToDelete,
}: {
	list: ProductV2[];
	prefix?: string;
	customerIdsToDelete?: string[];
}): ConfigFn => {
	return (config) => ({
		...config,
		products: list,
		productPrefix: prefix,
		customerIds: customerIdsToDelete,
	});
};

/**
 * Define entities to create for this test scenario.
 * Entities are auto-generated with ids "ent-1", "ent-2", etc.
 * @param count - Number of entities to create
 * @param featureId - Feature ID for all entities (e.g., TestFeature.Users)
 * @example s.entities({ count: 2, featureId: TestFeature.Users })
 */
const entities = ({
	count,
	featureId,
}: {
	count: number;
	featureId: string;
}): ConfigFn => {
	return (config) => ({ ...config, entityConfig: { count, featureId } });
};

/**
 * Define additional customers for this test scenario.
 * Useful for referral tests where you need a referrer and redeemer.
 * Other customers share the same test clock as the primary customer.
 * @param customers - Array of customer configurations
 * @example s.otherCustomers([{ id: "redeemer", paymentMethod: "success" }])
 */
const otherCustomers = (customers: OtherCustomerConfig[]): ConfigFn => {
	return (config) => ({ ...config, otherCustomers: customers });
};

/**
 * Define a referral program for this test scenario.
 * IDs are auto-suffixed with the product prefix for test isolation.
 * @param reward - The reward configuration
 * @param program - The referral program configuration
 * @example s.referralProgram({ reward: rewards.monthOff(), program: referralPrograms.onCheckoutReferrer({ ... }) })
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
 * Define a reward/coupon for this test scenario.
 * Reward ID is auto-suffixed with the product prefix for test isolation.
 * @param reward - The reward configuration (from constructCoupon)
 * @param productId - The product ID to apply this reward to
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
 * Attach a product to the customer or a specific entity.
 * Product ID is auto-prefixed with customerId.
 * Actions are executed in the order they appear in the actions array.
 * @param productId - The product ID (without prefix)
 * @param customerId - Optional: use this customer instead of primary (from otherCustomers)
 * @param entityIndex - Optional entity index (0-based) to attach to (omit for customer-level)
 * @param options - Optional feature options (e.g., prepaid quantity)
 * @param newBillingSubscription - Create a separate Stripe subscription for this product
 * @param timeout - Optional timeout in milliseconds for the attach request
 * @example s.attach({ productId: "pro" }) // customer-level
 * @example s.attach({ productId: "pro", customerId: "redeemer" }) // attach to other customer
 * @example s.attach({ productId: "pro", entityIndex: 0 }) // attach to first entity (ent-1)
 * @example s.attach({ productId: "free", entityIndex: 1 }) // attach to second entity (ent-2)
 * @example s.attach({ productId: "pro", options: [{ feature_id: "messages", quantity: 100 }] })
 * @example s.attach({ productId: "addon", newBillingSubscription: true }) // separate subscription
 * @example s.attach({ productId: "pro", timeout: 5000 }) // with timeout
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
	const defaultTimeout = concurrency > 1 ? 5000 : 4000;
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
 * Cancel a product subscription for the customer or a specific entity.
 * Actions are executed in the order they appear in the actions array.
 * @param productId - The product ID (without prefix)
 * @param entityIndex - Optional entity index (0-based) to cancel for (omit for customer-level)
 * @example s.cancel({ productId: "pro" }) // customer-level
 * @example s.cancel({ productId: "pro", entityIndex: 0 }) // cancel for first entity
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
 * Advance the Stripe test clock.
 * Actions are executed in the order they appear in the actions array.
 * Multiple advanceTestClock calls are executed sequentially, each starting from where the previous one ended.
 * @param days - Number of days to advance
 * @param weeks - Number of weeks to advance
 * @param hours - Number of hours to advance
 * @param months - Number of months to advance
 * @param toNextInvoice - Advance to next billing cycle + invoice finalization time
 * @param waitForSeconds - Wait for Stripe webhooks to process after advancing
 * @example s.advanceTestClock({ days: 15 }) // advance 15 days
 * @example s.advanceTestClock({ months: 1 }) // advance 1 month
 * @example s.advanceTestClock({ toNextInvoice: true }) // advance to next invoice
 * @example s.advanceTestClock({ days: 8, waitForSeconds: 30 }) // advance 8 days, wait 30s for webhooks
 * @example
 * // Interleaved actions:
 * s.attach({ productId: "pro" }),
 * s.advanceTestClock({ days: 7 }),
 * s.cancel({ productId: "pro" }),
 * s.advanceTestClock({ days: 3 }),
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
 * Attach or replace a payment method for the customer.
 * Useful for testing payment failures or 3DS authentication flows mid-scenario.
 * @param type - Payment method type: "success", "fail", or "authenticate"
 * @example s.attachPaymentMethod({ type: "authenticate" }) // attach 3DS-required card
 * @example s.attachPaymentMethod({ type: "fail" }) // attach card that will fail
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

/**
 * Remove all payment methods from the customer.
 * Useful for testing "no payment method" scenarios.
 * @example s.removePaymentMethod()
 */
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
 * Track usage for a feature on the customer or a specific entity.
 * @param featureId - The feature ID to track usage for
 * @param value - The usage value to track
 * @param entityIndex - Optional entity index (0-based) to track for (omit for customer-level)
 * @param timeout - Optional timeout in milliseconds to wait after tracking (for sync)
 * @example s.track({ featureId: TestFeature.Messages, value: 300 }) // customer-level
 * @example s.track({ featureId: TestFeature.Messages, value: 250, entityIndex: 0 }) // entity-level
 * @example s.track({ featureId: TestFeature.Messages, value: 300, timeout: 2000 }) // with timeout
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
 * Update a subscription (e.g., cancel end of cycle, add items).
 * @param productId - The product ID (without prefix)
 * @param entityIndex - Optional entity index (0-based) for entity-level subscription
 * @param cancelAction - Cancel action: "cancel_end_of_cycle", "cancel_immediately", or "uncancel"
 * @param items - Optional items to add/update on the subscription
 * @example s.updateSubscription({ productId: "pro", cancelAction: "cancel_end_of_cycle" }) // customer-level
 * @example s.updateSubscription({ productId: "pro", entityIndex: 0, cancelAction: "cancel_end_of_cycle" }) // entity-level
 * @example s.updateSubscription({ productId: "pro", items: [consumableItem] }) // add items
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
 * Advance the test clock to the next invoice cycle.
 * @param withPause - If true, advances in two steps (to month boundary, then to finalize)
 * @example s.advanceToNextInvoice()
 * @example s.advanceToNextInvoice({ withPause: true })
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
 * Reset a feature's usage cycle to simulate end-of-cycle rollover creation.
 * Use this for FREE products (no Stripe subscription) to create rollovers.
 * For PAID products, use s.advanceToNextInvoice() instead.
 *
 * @param featureId - The feature ID to reset
 * @param timeout - Optional timeout in milliseconds to wait after reset (default: 2000)
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
 * Delete a customer before the test runs.
 * Uses API to clear cache. Silently ignores if customer doesn't exist.
 * @param customerId - Delete by customer ID
 * @param email - Delete all customers with this email
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
 * Attach a product using the NEW billing/attach V2 endpoint.
 * Product ID is auto-prefixed with customerId.
 *
 * NOTE: Add-on is defined at product level using `products.recurringAddOn()` or
 * `products.base({ isAddOn: true })`, NOT in the attach params.
 *
 * @param productId - The product ID (without prefix)
 * @param customerId - Optional: use this customer instead of primary (from otherCustomers)
 * @param entityIndex - Optional entity index (0-based) to attach to (omit for customer-level)
 * @param options - Optional feature options (e.g., prepaid quantity)
 * @param newBillingSubscription - Create a separate Stripe subscription for this product
 * @param planSchedule - Override plan timing: "immediate" or "end_of_cycle"
 * @param timeout - Optional timeout in milliseconds for the attach request
 * @param items - Custom product items (creates is_custom customer product)
 * @example s.billing.attach({ productId: "pro" }) // customer-level
 * @example s.billing.attach({ productId: "pro", customerId: "redeemer" }) // attach to other customer
 * @example s.billing.attach({ productId: "pro", entityIndex: 0 }) // attach to first entity
 * @example s.billing.attach({ productId: "pro", planSchedule: "end_of_cycle" }) // scheduled upgrade
 * @example s.billing.attach({ productId: "pro", items: [items.monthlyMessages({ includedUsage: 750 })] }) // custom plan
 */
const billingAttach = ({
	productId,
	customerId,
	entityIndex,
	options,
	newBillingSubscription,
	planSchedule,
	timeout,
	items,
}: {
	productId: string;
	customerId?: string;
	entityIndex?: number;
	options?: FeatureOption[];
	newBillingSubscription?: boolean;
	planSchedule?: PlanTiming;
	timeout?: number;
	items?: ProductItem[];
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
				newBillingSubscription,
				planSchedule,
				timeout: timeout ?? defaultTimeout,
				items,
			},
		],
	});
};

/**
 * Multi-attach multiple plans to a customer or entity via /billing.multi_attach.
 * @param plans - Array of plans to attach, each with productId and optional featureQuantities/version
 * @param entityIndex - Optional entity index (0-based) to attach to (omit for customer-level)
 * @param freeTrial - Optional free trial config applied to all plans
 * @param timeout - Optional timeout in milliseconds
 * @example s.billing.multiAttach({ plans: [{ productId: "pro" }, { productId: "addon" }] })
 * @example s.billing.multiAttach({ plans: [{ productId: "pro" }], entityIndex: 0 })
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

// ═══════════════════════════════════════════════════════════════════
// REFERRAL ACTIONS
// ═══════════════════════════════════════════════════════════════════

/**
 * Create a referral code for the primary customer.
 * Requires s.referralProgram() to be configured.
 * @example s.referral.createCode()
 */
const createReferralCode = (): ConfigFn => {
	return (config) => ({
		...config,
		actions: [...config.actions, { type: "createReferralCode" as const }],
	});
};

/**
 * Redeem the created referral code for a customer.
 * Requires s.referral.createCode() to be called first.
 * @param customerId - The customer ID to redeem for (from otherCustomers)
 * @example s.referral.redeem({ customerId: "redeemer" })
 */
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

/**
 * Create and redeem a referral code in one action.
 * Creates code for primary customer, redeems for specified customer.
 * @param customerId - The customer ID to redeem for (from otherCustomers)
 * @example s.referral.createAndRedeem({ customerId: "redeemer" })
 */
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
 * Scenario configuration functions.
 * Import and use with initScenario to configure test setup.
 * @example
 * ```typescript
 * import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
 *
 * const { autumnV1, ctx } = await initScenario({
 *   customerId: "my-test",
 *   options: [
 *     s.customer({ paymentMethod: "success" }),
 *     s.products({ list: [pro, free] }),
 *     s.attach({ productId: "pro" }),
 *   ],
 * });
 * ```
 */
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
	referral: {
		createCode: createReferralCode,
		redeem: redeemReferralCode,
		createAndRedeem: createAndRedeemReferralCode,
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
};

/**
 * Initialize a complete test scenario with customer, products, entities, and attachments.
 * Uses functional composition for flexible configuration.
 * Actions are executed in the exact order they appear in the actions array.
 *
 * @param customerId - Unique identifier used as customer ID and product prefix. If not provided, customer creation is skipped.
 * @param setup - Configuration functions (customer, products, entities)
 * @param actions - Action functions (attach, cancel, advanceTestClock) - executed in order
 * @returns autumnV1, autumnV2, ctx, testClockId, customer, entities, advancedTo
 *
 * @example
 * ```typescript
 * // Simple test
 * const { autumnV1, ctx } = await initScenario({
 *   customerId: "simple-test",
 *   setup: [
 *     s.customer({ paymentMethod: "success" }),
 *     s.products({ list: [free] }),
 *   ],
 *   actions: [
 *     s.attach({ productId: "base" }),
 *   ],
 * });
 *
 * // Products only (no customer) - useful for null ID tests
 * const { autumnV1 } = await initScenario({
 *   setup: [s.products({ list: [freeDefault] })],
 *   actions: [],
 * });
 *
 * // Interleaved actions - executed in order
 * const { autumnV1, ctx, advancedTo } = await initScenario({
 *   customerId: "interleaved-test",
 *   setup: [
 *     s.customer({ testClock: true, paymentMethod: "success" }),
 *     s.products({ list: [pro] }),
 *   ],
 *   actions: [
 *     s.attach({ productId: "pro" }),
 *     s.advanceTestClock({ days: 7 }),  // Advance 7 days
 *     s.cancel({ productId: "pro" }),
 *     s.advanceTestClock({ days: 3 }),  // Advance another 3 days (10 total)
 *   ],
 * });
 * ```
 */
// Other customer result type
type OtherCustomerResult = {
	id: string;
	customer: Awaited<ReturnType<typeof initCustomerV3>>["customer"];
};

// Overload: when customerId is provided, return type has customerId: string
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
	autumnV2: AutumnInt;
	autumnV2_1: AutumnInt;
	testClockId: string | undefined;
	customer: Awaited<ReturnType<typeof initCustomerV3>>["customer"];
	ctx: TestContext;
	entities: GeneratedEntity[];
	advancedTo: number;
	otherCustomers: Map<string, OtherCustomerResult>;
	referralCode: ReferralCode | null;
	redemption: RewardRedemption | null;
}>;

// Overload: when customerId is not provided, return type has customerId: undefined
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
	autumnV2: AutumnInt;
	autumnV2_1: AutumnInt;
	testClockId: undefined;
	customer: null;
	ctx: TestContext;
	entities: GeneratedEntity[];
	advancedTo: number;
	otherCustomers: Map<string, OtherCustomerResult>;
	referralCode: ReferralCode | null;
	redemption: RewardRedemption | null;
}>;

// Implementation
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
}) {
	// Use provided context or fall back to default
	const ctx = ctxOverride ?? defaultCtx;
	// Build config from setup and actions
	const config = [...setup, ...actions].reduce((c, fn) => fn(c), defaultConfig);

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

	// 1. Initialize products & delete previous customers (prefix = customerId for isolation)
	// Priority: explicit productPrefix > customerId > "shared"
	const productPrefix = config.productPrefix ?? customerId ?? "shared";

	// Collect all customer IDs to delete (primary + other customers)
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
		});
	}

	// 1.5. Initialize referral program (if configured)
	// Suffix IDs with productPrefix for isolation and mutate in place
	if (config.referralProgram) {
		const { reward, program } = config.referralProgram;

		// Suffix reward ID
		reward.id = `${reward.id}_${productPrefix}`;

		// Suffix program ID and update internal_reward_id reference
		program.id = `${program.id}_${productPrefix}`;
		program.internal_reward_id = reward.id;

		// Suffix product_ids to match prefixed products
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

	// 1.6. Initialize standalone rewards (if configured)
	for (const rewardConfig of config.rewards) {
		const { reward, productId } = rewardConfig;

		// Suffix reward ID with productPrefix for isolation
		reward.id = `${reward.id}_${productPrefix}`;

		// Suffix productId to match prefixed products
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
			withDefault: config.withDefault ?? false, // RIP
			// Default group matches the product prefix (customerId) used in initProductsV0
			defaultGroup: config.defaultGroup ?? customerId,
			skipWebhooks: config.skipWebhooks,
			sendEmailReceipts: config.sendEmailReceipts,
			nameOverride: config.nameOverride,
			emailOverride: config.emailOverride,
		});
		testClockId = result.testClockId;
		customer = result.customer;
	}

	// 2.5. Initialize other customers (share test clock with primary customer)
	const otherCustomersMap = new Map<string, OtherCustomerResult>();
	for (const otherCusConfig of config.otherCustomers) {
		const otherResult = await initCustomerV3({
			ctx,
			customerId: otherCusConfig.id,
			customerData: otherCusConfig.data,
			attachPm: otherCusConfig.paymentMethod,
			withTestClock: false, // Don't create a new test clock
			...(testClockId ? { existingTestClockId: testClockId } : {}),
			withDefault: false,
			defaultGroup: productPrefix,
			skipWebhooks: config.skipWebhooks,
		});
		otherCustomersMap.set(otherCusConfig.id, {
			id: otherCusConfig.id,
			customer: otherResult.customer,
		});
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

	// 4. Create entities if any (requires customerId)
	if (generatedEntities.length > 0) {
		if (!customerId) {
			throw new Error(
				"Cannot create entities: customerId is required when using s.entities()",
			);
		}
		const entityDefs = generatedEntities.map((e) => ({
			id: e.id,
			name: e.name,
			feature_id: e.featureId,
		}));
		await autumnV1.entities.create(customerId, entityDefs);
	}

	// 5. Execute actions in order (attach, cancel, advanceClock, referrals)
	let advancedTo: number = Date.now();
	let referralCode: ReferralCode | null = null;
	let redemption: RewardRedemption | null = null;

	for (const action of config.actions) {
		if (action.type === "attach") {
			// Resolve target customer: action.customerId override or primary customerId
			const targetCustomerId = action.customerId ?? customerId;
			if (!targetCustomerId) {
				throw new Error(
					"Cannot attach product: customerId is required when using s.attach()",
				);
			}
			const prefixedProductId = `${action.productId}_${productPrefix}`;

			// Resolve entityIndex to entityId
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

			// Resolve entityIndex to entityId
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

			// Resolve entityIndex to entityId
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

			// Resolve entityIndex to entityId
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
			// Resolve target customer: action.customerId override or primary customerId
			const targetCustomerId = action.customerId ?? customerId;
			if (!targetCustomerId) {
				throw new Error(
					"Cannot attach product: customerId is required when using s.billing.attach()",
				);
			}
			const prefixedProductId = `${action.productId}_${productPrefix}`;

			// Resolve entityIndex to entityId
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
					new_billing_subscription: action.newBillingSubscription,
					plan_schedule: action.planSchedule,
					items: action.items,
				},
				{ timeout: action.timeout },
			);
		} else if (action.type === "billingMultiAttach") {
			if (!customerId) {
				throw new Error(
					"Cannot multi-attach: customerId is required when using s.billing.multiAttach()",
				);
			}

			// Resolve entityIndex to entityId
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

			// Product group is always the productPrefix (customerId)
			// All products in a test share the same group unless explicitly overridden
			// The productId param is not used for group - it was a naming confusion
			const productGroup = productPrefix;

			await resetAndGetCusEnt({
				ctx,
				customer,
				productGroup,
				featureId: action.featureId,
			});

			// Wait for cache to clear (default 2000ms)
			const waitTime = action.timeout ?? 2000;
			await new Promise((resolve) => setTimeout(resolve, waitTime));
		}
	}

	return {
		customerId,
		autumnV0,
		autumnV1,
		autumnV1Beta,
		autumnV2,
		autumnV2_1,
		testClockId,
		customer,
		ctx,
		entities: generatedEntities,
		advancedTo,
		otherCustomers: otherCustomersMap,
		referralCode,
		redemption,
	};
}
