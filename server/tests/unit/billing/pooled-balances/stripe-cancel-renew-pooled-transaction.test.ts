import { expect, test } from "bun:test";
import {
	AppEnv,
	type AutumnBillingPlan,
	CusProductStatus,
	type FullCusProduct,
} from "@autumn/shared";
import { customerProducts } from "@tests/utils/fixtures/db/customerProducts.js";
import { customers } from "@tests/utils/fixtures/db/customers.js";
import type { StripeSubscriptionUpdatedContext } from "@/external/stripe/webhookHandlers/handleStripeSubscriptionUpdated/stripeSubscriptionUpdatedContext.js";
import {
	type HandleStripeSubscriptionCanceledDependencies,
	handleStripeSubscriptionCanceledWithDependencies,
} from "@/external/stripe/webhookHandlers/handleStripeSubscriptionUpdated/tasks/handleStripeSubscriptionCanceled/handleStripeSubscriptionCanceled.js";
import {
	type HandleStripeSubscriptionRenewedDependencies,
	handleStripeSubscriptionRenewedWithDependencies,
} from "@/external/stripe/webhookHandlers/handleStripeSubscriptionUpdated/tasks/handleStripeSubscriptionRenewed/handleStripeSubscriptionRenewed.js";
import type { StripeWebhookContext } from "@/external/stripe/webhookMiddlewares/stripeWebhookContext.js";

type LifecycleState = {
	canceled: boolean;
	canceledAt: number | null;
	endedAt: number | null;
	poolEffectiveAt: number | null;
};

const cancelAt = 2_000_000_000_000;

const createCustomerProduct = ({ canceled }: { canceled: boolean }) => {
	const customerProduct = customerProducts.create({
		id: "customer_product_one",
		status: CusProductStatus.Active,
		subscriptionIds: ["subscription_one"],
		endedAt: canceled ? cancelAt : null,
	});
	customerProduct.internal_customer_id = "cus_internal_test";
	customerProduct.canceled = canceled;
	customerProduct.canceled_at = canceled ? cancelAt - 1_000 : null;
	return customerProduct;
};

const createSubscriptionContext = ({
	customerProduct,
	event,
}: {
	customerProduct: FullCusProduct;
	event: "cancel" | "renew";
}): StripeSubscriptionUpdatedContext => {
	const fullCustomer = customers.create({
		customerProducts: [customerProduct],
	});
	return {
		stripeSubscription: {
			id: "subscription_one",
			cancel_at: null,
			cancel_at_period_end: event === "cancel",
			canceled_at: event === "cancel" ? (cancelAt - 1_000) / 1_000 : null,
			schedule: null,
			items: {
				data: [{ current_period_end: cancelAt / 1_000 }],
			},
		} as never,
		previousAttributes:
			event === "cancel"
				? { cancel_at_period_end: false }
				: { cancel_at_period_end: true },
		fullCustomer,
		customerProducts: fullCustomer.customer_products,
		nowMs: cancelAt - 2_000,
		updatedCustomerProducts: [],
		deletedCustomerProducts: [],
		insertedCustomerProducts: [],
		oneOffPrepaidCarryOvers: [],
		billingChangeTags: new Set(),
	};
};

const createWebhookContext = (): StripeWebhookContext =>
	({
		db: {} as never,
		org: { id: "org_test", config: { sync_status: false } },
		env: AppEnv.Sandbox,
		logger: {
			debug: () => {},
			info: () => {},
			error: () => {},
		},
	}) as unknown as StripeWebhookContext;

const applyPlan = ({
	state,
	autumnBillingPlan,
}: {
	state: LifecycleState;
	autumnBillingPlan: AutumnBillingPlan;
}) => {
	for (const { updates } of autumnBillingPlan.updateCustomerProducts ?? []) {
		if (typeof updates.canceled === "boolean") {
			state.canceled = updates.canceled;
		}
		if (updates.canceled_at !== undefined) {
			state.canceledAt = updates.canceled_at ?? null;
		}
		if (updates.ended_at !== undefined) {
			state.endedAt = updates.ended_at ?? null;
		}
	}

	for (const operation of autumnBillingPlan.pooledBalanceOps ?? []) {
		if (operation.op === "stage_owner_removal") {
			state.poolEffectiveAt = operation.effectiveAt;
		}
		if (
			operation.op === "restore_owner" &&
			state.poolEffectiveAt === operation.expectedEffectiveAt
		) {
			state.poolEffectiveAt = null;
		}
	}
};

const createDependencies = ({
	initialState,
}: {
	initialState: LifecycleState;
}) => {
	let committedState = structuredClone(initialState);
	let injectFailure = true;
	let planCalls = 0;
	let webhookCalls = 0;

	const executeAutumnBillingPlan = async ({
		autumnBillingPlan,
	}: {
		autumnBillingPlan: AutumnBillingPlan;
	}) => {
		planCalls += 1;
		const transactionState = structuredClone(committedState);
		applyPlan({ state: transactionState, autumnBillingPlan });
		if (injectFailure) throw new Error("injected pooled lifecycle failure");
		committedState = transactionState;
	};

	const commonDependencies = {
		getStripeSubscriptionLock: async () => null,
		executeAutumnBillingPlan,
		addProductsUpdatedWebhookTask: async () => {
			webhookCalls += 1;
		},
	};

	return {
		cancelDependencies: {
			...commonDependencies,
			scheduleDefaultProducts: async () => new Map(),
		} as unknown as HandleStripeSubscriptionCanceledDependencies,
		renewDependencies: {
			...commonDependencies,
		} as unknown as HandleStripeSubscriptionRenewedDependencies,
		allowRetry: () => {
			injectFailure = false;
		},
		getCommittedState: () => committedState,
		getPlanCalls: () => planCalls,
		getWebhookCalls: () => webhookCalls,
	};
};

test("Stripe cancellation failure rolls back product and pool staging, then retry converges", async () => {
	const customerProduct = createCustomerProduct({ canceled: false });
	const subscriptionUpdatedContext = createSubscriptionContext({
		customerProduct,
		event: "cancel",
	});
	const harness = createDependencies({
		initialState: {
			canceled: false,
			canceledAt: null,
			endedAt: null,
			poolEffectiveAt: null,
		},
	});

	await expect(
		handleStripeSubscriptionCanceledWithDependencies({
			ctx: createWebhookContext(),
			subscriptionUpdatedContext,
			dependencies: harness.cancelDependencies,
		}),
	).rejects.toThrow("injected pooled lifecycle failure");
	expect(harness.getCommittedState()).toEqual({
		canceled: false,
		canceledAt: null,
		endedAt: null,
		poolEffectiveAt: null,
	});
	expect(subscriptionUpdatedContext.customerProducts[0].canceled).toBe(false);
	expect(subscriptionUpdatedContext.updatedCustomerProducts).toHaveLength(0);
	expect(harness.getWebhookCalls()).toBe(0);

	harness.allowRetry();
	await handleStripeSubscriptionCanceledWithDependencies({
		ctx: createWebhookContext(),
		subscriptionUpdatedContext,
		dependencies: harness.cancelDependencies,
	});
	expect(harness.getCommittedState()).toEqual({
		canceled: true,
		canceledAt: cancelAt - 1_000,
		endedAt: cancelAt,
		poolEffectiveAt: cancelAt,
	});
	expect(harness.getPlanCalls()).toBe(2);
	expect(harness.getWebhookCalls()).toBe(1);
	expect(subscriptionUpdatedContext.updatedCustomerProducts).toHaveLength(1);
});

test("Stripe renewal failure rolls back uncancel and pool restore so retry is not skipped", async () => {
	const customerProduct = createCustomerProduct({ canceled: true });
	const subscriptionUpdatedContext = createSubscriptionContext({
		customerProduct,
		event: "renew",
	});
	const harness = createDependencies({
		initialState: {
			canceled: true,
			canceledAt: cancelAt - 1_000,
			endedAt: cancelAt,
			poolEffectiveAt: cancelAt,
		},
	});

	await expect(
		handleStripeSubscriptionRenewedWithDependencies({
			ctx: createWebhookContext(),
			subscriptionUpdatedContext,
			dependencies: harness.renewDependencies,
		}),
	).rejects.toThrow("injected pooled lifecycle failure");
	expect(harness.getCommittedState()).toEqual({
		canceled: true,
		canceledAt: cancelAt - 1_000,
		endedAt: cancelAt,
		poolEffectiveAt: cancelAt,
	});
	expect(subscriptionUpdatedContext.customerProducts[0].canceled).toBe(true);
	expect(subscriptionUpdatedContext.updatedCustomerProducts).toHaveLength(0);

	harness.allowRetry();
	await handleStripeSubscriptionRenewedWithDependencies({
		ctx: createWebhookContext(),
		subscriptionUpdatedContext,
		dependencies: harness.renewDependencies,
	});
	expect(harness.getCommittedState()).toEqual({
		canceled: false,
		canceledAt: null,
		endedAt: null,
		poolEffectiveAt: null,
	});
	expect(harness.getPlanCalls()).toBe(2);
	expect(subscriptionUpdatedContext.updatedCustomerProducts).toHaveLength(1);
});
