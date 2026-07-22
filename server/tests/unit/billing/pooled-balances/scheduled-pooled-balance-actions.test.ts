import { beforeEach, expect, mock, test } from "bun:test";
import {
	type AutumnBillingPlan,
	CusProductStatus,
	EntInterval,
	type FullCusProduct,
} from "@autumn/shared";
import { customerEntitlements } from "@tests/utils/fixtures/db/customerEntitlements.js";
import { customerProducts } from "@tests/utils/fixtures/db/customerProducts.js";
import { customers } from "@tests/utils/fixtures/db/customers.js";
import type { StripeSubscriptionDeletedContext } from "@/external/stripe/webhookHandlers/handleStripeSubscriptionDeleted/setupStripeSubscriptionDeletedContext.js";
import type { StripeSubscriptionUpdatedContext } from "@/external/stripe/webhookHandlers/handleStripeSubscriptionUpdated/stripeSubscriptionUpdatedContext.js";

let executedPlans: AutumnBillingPlan[] = [];
let productsUpdatedWebhookCalls = 0;
let reapplyUsageCalls = 0;
let reapplyRolloverCalls = 0;
let freeSuccessorCalls = 0;
let expiredCacheWrites = 0;
let reappliedUsageBalance: number | undefined;
let executePlanError: Error | undefined;

mock.module(
	"@/internal/billing/v2/execute/executeAutumnBillingPlan.js",
	() => ({
		executeAutumnBillingPlan: async ({
			autumnBillingPlan,
		}: {
			autumnBillingPlan: AutumnBillingPlan;
		}) => {
			if (executePlanError) throw executePlanError;
			executedPlans.push(autumnBillingPlan);
		},
	}),
);
mock.module("@/internal/analytics/handlers/handleProductsUpdated", () => ({
	addProductsUpdatedWebhookTask: async () => {
		productsUpdatedWebhookCalls += 1;
	},
}));
mock.module(
	"@/internal/billing/v2/utils/initFullCustomerProduct/reapplyExistingUsagesToCustomerProduct",
	() => ({
		reapplyExistingUsagesToCustomerProduct: async ({
			fromCustomerProduct,
			customerProduct,
		}: {
			fromCustomerProduct?: FullCusProduct;
			customerProduct: FullCusProduct;
		}) => {
			reapplyUsageCalls += 1;
			if (reappliedUsageBalance !== undefined) {
				customerProduct.customer_entitlements[0]!.balance =
					reappliedUsageBalance;
			}
			return fromCustomerProduct;
		},
	}),
);
mock.module(
	"@/internal/billing/v2/utils/initFullCustomerProduct/reapplyExistingRolloversToCustomerProduct",
	() => ({
		reapplyExistingRolloversToCustomerProduct: async () => {
			reapplyRolloverCalls += 1;
		},
	}),
);
mock.module(
	"@/internal/customers/cusProducts/actions/activateFreeSuccessorProduct",
	() => ({
		activateFreeSuccessorProduct: async () => {
			freeSuccessorCalls += 1;
			return {};
		},
	}),
);
mock.module(
	"@/external/stripe/subscriptions/utils/lockStripeSubscriptionUtils",
	() => ({
		getStripeSubscriptionLock: async () => null,
		setStripeSubscriptionLock: async () => {},
	}),
);
mock.module(
	"@/external/stripe/webhookHandlers/handleStripeSubscriptionUpdated/tasks/handleSchedulePhaseChanges/releaseScheduleIfLastPhase",
	() => ({ releaseScheduleIfLastPhase: async () => {} }),
);
mock.module("@/internal/customers/cusProducts/actions/expiredCache", () => ({
	getExpiredCustomerProductsCache: async () => [],
	setExpiredCustomerProductsCache: async () => {
		expiredCacheWrites += 1;
	},
}));

const { activateScheduledCustomerProduct } = await import(
	"@/internal/customers/cusProducts/actions/activateScheduled.js"
);
const { expireCustomerProductAndActivateDefault } = await import(
	"@/internal/customers/cusProducts/actions/expireAndActivateDefault.js"
);
const { handleSchedulePhaseChanges } = await import(
	"@/external/stripe/webhookHandlers/handleStripeSubscriptionUpdated/tasks/handleSchedulePhaseChanges/handleSchedulePhaseChanges.js"
);
const { expireAndActivateCustomerProducts } = await import(
	"@/external/stripe/webhookHandlers/handleStripeSubscriptionDeleted/tasks/expireAndActivateCustomerProducts.js"
);

const STARTS_AT = Date.now() - 1_000;
const ENDS_AT = Date.now() + 86_400_000;

const createPooledCustomerProduct = ({
	id = "customer_product_scheduled_entity_pro",
	status,
	startsAt = STARTS_AT,
	endedAt = ENDS_AT,
	subscriptionIds = [],
}: {
	id?: string;
	status: CusProductStatus;
	startsAt?: number;
	endedAt?: number;
	subscriptionIds?: string[];
}): FullCusProduct => {
	const customerEntitlement = customerEntitlements.create({
		id: `customer_entitlement_${id}`,
		entitlementId: "entitlement_messages",
		featureId: "messages",
		featureName: "Messages",
		allowance: 500,
		balance: 500,
		customerProductId: id,
		interval: EntInterval.Month,
		nextResetAt: STARTS_AT + 2_592_000_000,
	});
	customerEntitlement.reset_cycle_anchor = STARTS_AT;
	customerEntitlement.entitlement = {
		...customerEntitlement.entitlement,
		pooled: true,
	};

	return customerProducts.create({
		id,
		productId: "entity_pro",
		customerEntitlements: [customerEntitlement],
		internalEntityId: "internal_entity_one",
		entityId: "entity_one",
		status,
		startsAt,
		endedAt,
		subscriptionIds,
	});
};

const createContext = () =>
	({
		db: {},
		org: { id: "org_test" },
		env: "sandbox",
		logger: {
			debug: () => {},
			info: () => {},
		},
		extraLogs: {},
	}) as never;

beforeEach(() => {
	executedPlans = [];
	productsUpdatedWebhookCalls = 0;
	reapplyUsageCalls = 0;
	reapplyRolloverCalls = 0;
	freeSuccessorCalls = 0;
	expiredCacheWrites = 0;
	reappliedUsageBalance = undefined;
	executePlanError = undefined;
});

test("scheduled activation upserts the pooled source in the same lifecycle plan", async () => {
	const scheduledCustomerProduct = createPooledCustomerProduct({
		status: CusProductStatus.Scheduled,
	});
	const fullCustomer = customers.create({
		customerProducts: [scheduledCustomerProduct],
	});

	await activateScheduledCustomerProduct({
		ctx: createContext(),
		customerProduct: scheduledCustomerProduct,
		fullCustomer,
	});

	expect(executedPlans).toHaveLength(1);
	expect(executedPlans[0]?.pooledBalanceOps).toEqual([
		expect.objectContaining({
			op: "upsert_source",
			currentCycleContribution: 500,
			sourceCustomerProductId: scheduledCustomerProduct.id,
		}),
	]);
	expect(executedPlans[0]?.updateCustomerEntitlements).toEqual([
		expect.objectContaining({
			customerEntitlement: scheduledCustomerProduct.customer_entitlements[0],
			updates: expect.objectContaining({ balance: 0, adjustment: 0 }),
		}),
	]);
});

test("scheduled activation carries non-pooled usage into the pooled operation", async () => {
	const outgoingCustomerProduct = createPooledCustomerProduct({
		id: "customer_product_non_pooled_outgoing",
		status: CusProductStatus.Active,
	});
	outgoingCustomerProduct.customer_entitlements[0]!.entitlement = {
		...outgoingCustomerProduct.customer_entitlements[0]!.entitlement,
		pooled: false,
	};
	outgoingCustomerProduct.customer_entitlements[0]!.balance = 400;
	const scheduledCustomerProduct = createPooledCustomerProduct({
		id: "customer_product_pooled_incoming",
		status: CusProductStatus.Scheduled,
	});
	const fullCustomer = customers.create({
		customerProducts: [outgoingCustomerProduct, scheduledCustomerProduct],
	});
	reappliedUsageBalance = 400;

	await activateScheduledCustomerProduct({
		ctx: createContext(),
		fromCustomerProduct: outgoingCustomerProduct,
		customerProduct: scheduledCustomerProduct,
		fullCustomer,
	});

	expect(executedPlans[0]?.pooledBalanceOps).toEqual([
		expect.objectContaining({
			op: "upsert_source",
			usageReapply: {
				amount: 100,
				excludedSourceCustomerProductId: outgoingCustomerProduct.id,
			},
		}),
	]);
});

test("automatic expiry removes the pooled source in the same lifecycle plan", async () => {
	const activeCustomerProduct = createPooledCustomerProduct({
		status: CusProductStatus.Active,
	});
	const fullCustomer = customers.create({
		customerProducts: [activeCustomerProduct],
	});

	await expireCustomerProductAndActivateDefault({
		ctx: createContext(),
		customerProduct: activeCustomerProduct,
		fullCustomer,
	});

	expect(executedPlans).toHaveLength(1);
	expect(executedPlans[0]?.pooledBalanceOps).toEqual([
		{
			op: "remove_source",
			internalCustomerId: activeCustomerProduct.internal_customer_id,
			sourceCustomerProductId: activeCustomerProduct.id,
			effectiveAt: null,
		},
	]);
	expect(executedPlans[0]?.updateCustomerProducts).toEqual([
		expect.objectContaining({
			customerProduct: activeCustomerProduct,
			updates: expect.objectContaining({ status: CusProductStatus.Expired }),
		}),
	]);
});

test("subscription deletion expires only live pooled products in one merged lifecycle plan", async () => {
	const stripeSubscriptionId = "stripe_subscription_deleted_pooled";
	const firstCustomerProduct = createPooledCustomerProduct({
		id: "customer_product_deleted_first",
		status: CusProductStatus.Active,
		subscriptionIds: [stripeSubscriptionId],
	});
	const secondCustomerProduct = createPooledCustomerProduct({
		id: "customer_product_deleted_second",
		status: CusProductStatus.Active,
		subscriptionIds: [stripeSubscriptionId],
	});
	const scheduledCustomerProduct = createPooledCustomerProduct({
		id: "customer_product_deleted_scheduled",
		status: CusProductStatus.Scheduled,
		subscriptionIds: [stripeSubscriptionId],
	});
	const fullCustomer = customers.create({
		customerProducts: [
			firstCustomerProduct,
			secondCustomerProduct,
			scheduledCustomerProduct,
		],
	});
	const eventContext = {
		stripeSubscription: { id: stripeSubscriptionId },
		fullCustomer,
		customerProducts: [...fullCustomer.customer_products],
		updatedCustomerProducts: [],
		deletedCustomerProducts: [],
		insertedCustomerProducts: [],
		billingChangeTags: new Set(),
	} as unknown as StripeSubscriptionDeletedContext;

	await expireAndActivateCustomerProducts({
		ctx: createContext(),
		eventContext,
	});

	expect(executedPlans).toHaveLength(1);
	expect(executedPlans[0]?.updateCustomerProducts).toHaveLength(2);
	expect(executedPlans[0]?.pooledBalanceOps).toEqual([
		expect.objectContaining({
			op: "remove_source",
			sourceCustomerProductId: firstCustomerProduct.id,
		}),
		expect.objectContaining({
			op: "remove_source",
			sourceCustomerProductId: secondCustomerProduct.id,
		}),
	]);
	expect(executedPlans[0]?.pooledBalanceOps).not.toContainEqual(
		expect.objectContaining({
			sourceCustomerProductId: scheduledCustomerProduct.id,
		}),
	);
	expect(productsUpdatedWebhookCalls).toBe(2);
	expect(freeSuccessorCalls).toBe(2);
	expect(expiredCacheWrites).toBe(1);
});

test("subscription deletion performs no completion side effects when the merged plan fails", async () => {
	const stripeSubscriptionId = "stripe_subscription_deleted_failure";
	const customerProduct = createPooledCustomerProduct({
		id: "customer_product_deleted_failure",
		status: CusProductStatus.Active,
		subscriptionIds: [stripeSubscriptionId],
	});
	const fullCustomer = customers.create({
		customerProducts: [customerProduct],
	});
	const eventContext = {
		stripeSubscription: { id: stripeSubscriptionId },
		fullCustomer,
		customerProducts: [...fullCustomer.customer_products],
		updatedCustomerProducts: [],
		deletedCustomerProducts: [],
		insertedCustomerProducts: [],
		billingChangeTags: new Set(),
	} as unknown as StripeSubscriptionDeletedContext;
	executePlanError = new Error("synthetic merged plan failure");

	await expect(
		expireAndActivateCustomerProducts({
			ctx: createContext(),
			eventContext,
		}),
	).rejects.toThrow("synthetic merged plan failure");
	expect(productsUpdatedWebhookCalls).toBe(0);
	expect(freeSuccessorCalls).toBe(0);
	expect(expiredCacheWrites).toBe(0);
	expect(eventContext.updatedCustomerProducts).toHaveLength(0);
});

// Red: activation and expiry reached the executor as two plans; green: both operations share one plan.
test("a Stripe schedule boundary executes incoming and outgoing pooled sources in one plan", async () => {
	const incomingCustomerProduct = createPooledCustomerProduct({
		id: "customer_product_incoming",
		status: CusProductStatus.Scheduled,
		startsAt: STARTS_AT,
	});
	const outgoingCustomerProduct = createPooledCustomerProduct({
		id: "customer_product_outgoing",
		status: CusProductStatus.Active,
		startsAt: STARTS_AT - 2_592_000_000,
		endedAt: STARTS_AT,
	});
	const fullCustomer = customers.create({
		customerProducts: [outgoingCustomerProduct, incomingCustomerProduct],
	});

	const eventContext = {
		stripeSubscription: {
			id: "stripe_subscription_phase_change",
			schedule: {
				id: "stripe_schedule_phase_change",
				phases: [
					{
						start_date: Math.floor((STARTS_AT - 1_000) / 1_000),
						end_date: Math.floor((ENDS_AT + 1_000) / 1_000),
					},
				],
			},
		},
		previousAttributes: { items: {} },
		fullCustomer,
		customerProducts: [...fullCustomer.customer_products],
		nowMs: STARTS_AT,
		updatedCustomerProducts: [],
		deletedCustomerProducts: [],
		insertedCustomerProducts: [],
		oneOffPrepaidCarryOvers: [],
		billingChangeTags: new Set(),
	} as unknown as StripeSubscriptionUpdatedContext;

	await handleSchedulePhaseChanges({
		ctx: createContext(),
		eventContext,
	});

	expect(executedPlans).toHaveLength(1);
	expect(executedPlans[0]?.pooledBalanceOps?.map(({ op }) => op)).toEqual([
		"upsert_source",
		"remove_source",
	]);
	expect(reapplyUsageCalls).toBe(1);
	expect(reapplyRolloverCalls).toBe(1);
	expect(productsUpdatedWebhookCalls).toBe(2);
	expect(freeSuccessorCalls).toBe(1);
	expect(expiredCacheWrites).toBe(1);
	expect(eventContext.updatedCustomerProducts).toHaveLength(2);
	expect(eventContext.billingChangeTags).toContain("phase_changed");
});
