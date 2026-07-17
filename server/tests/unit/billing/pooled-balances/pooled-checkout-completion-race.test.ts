import { afterAll, beforeEach, expect, mock, test } from "bun:test";
import {
	type AutumnBillingPlan,
	CusProductStatus,
	type FullCusProduct,
	MetadataType,
} from "@autumn/shared";
import { customerProducts } from "@tests/utils/fixtures/db/customerProducts.js";

let deferredAutumnPlan: AutumnBillingPlan;
let checkoutCustomerProducts: FullCusProduct[] = [];
let executedAutumnPlan: AutumnBillingPlan | undefined;

mock.module(
	"@/external/stripe/webhookHandlers/handleStripeCheckoutSessionCompleted/tasks/handleCheckoutSessionEnabledImmediately/createStripeScheduleFromCheckout",
	() => ({ createStripeScheduleFromCheckout: async () => null }),
);
mock.module(
	"@/external/stripe/webhookHandlers/handleStripeCheckoutSessionCompleted/tasks/handleCheckoutSessionMetadataV2/modifyStripeSubscriptionFromCheckout",
	() => ({ modifyStripeSubscriptionFromCheckout: async () => undefined }),
);
mock.module(
	"@/external/stripe/webhookHandlers/handleStripeCheckoutSessionCompleted/tasks/handleCheckoutSessionMetadataV2/syncSubscriptionItemMetadataFromCheckout",
	() => ({ syncSubscriptionItemMetadataFromCheckout: async () => undefined }),
);
mock.module(
	"@/external/stripe/webhookHandlers/handleStripeCheckoutSessionCompleted/tasks/handleCheckoutSessionMetadataV2/updateBillingPlanFromCheckout",
	() => ({
		updateBillingPlanFromCheckout: async ({
			deferredData,
		}: {
			deferredData: unknown;
		}) => deferredData,
	}),
);
mock.module(
	"@/internal/billing/v2/actions/createSchedule/utils/persistDeferredCreateSchedule",
	() => ({ persistDeferredCreateSchedule: async () => undefined }),
);
mock.module("@/internal/billing/v2/execute/executeAutumnBillingPlan", () => ({
	executeAutumnBillingPlan: async ({
		autumnBillingPlan,
	}: {
		autumnBillingPlan: AutumnBillingPlan;
	}) => {
		executedAutumnPlan = autumnBillingPlan;
	},
}));
mock.module("@/internal/customers/cusProducts/CusProductService", () => ({
	CusProductService: {
		getByStripeCheckoutSessionId: async () => checkoutCustomerProducts,
	},
}));
mock.module("@/internal/metadata/MetadataService", () => ({
	MetadataService: { delete: async () => undefined },
}));
mock.module("@/queue/workflows", () => ({
	workflows: { triggerGrantCheckoutReward: async () => undefined },
}));

const { handleCheckoutSessionEnabledImmediately } = await import(
	"@/external/stripe/webhookHandlers/handleStripeCheckoutSessionCompleted/tasks/handleCheckoutSessionEnabledImmediately/handleCheckoutSessionEnabledImmediately.js"
);

afterAll(() => {
	mock.restore();
});

beforeEach(() => {
	executedAutumnPlan = undefined;
});

const runCompletionAfterExpiry = async ({
	intendedStatus,
	intendedEndedAt,
}: {
	intendedStatus: CusProductStatus;
	intendedEndedAt: number | null;
}) => {
	const intendedCustomerProduct = customerProducts.create({
		id: "customer_product_checkout_race",
		productId: "plan_checkout_race",
		status: intendedStatus,
	});
	intendedCustomerProduct.ended_at = intendedEndedAt;
	const expiredCustomerProduct = {
		...structuredClone(intendedCustomerProduct),
		status: CusProductStatus.Expired,
		ended_at: 1_800_000_000_000,
		subscription_ids: [],
	};
	checkoutCustomerProducts = [expiredCustomerProduct];
	deferredAutumnPlan = {
		customerId: "customer_checkout_race",
		insertCustomerProducts: [intendedCustomerProduct],
		pooledBalanceOps: [
			{
				op: "remove_source",
				internalCustomerId: "internal_customer_checkout_race",
				sourceCustomerProductId: intendedCustomerProduct.id,
				effectiveAt: null,
			},
		],
	};
	const deferredData = {
		billingPlan: { autumn: deferredAutumnPlan },
		billingContext: {},
	};

	await handleCheckoutSessionEnabledImmediately({
		ctx: {
			db: {},
			env: "sandbox",
			fullCustomer: { id: "customer_checkout_race" },
			logger: { info: () => undefined },
			org: { id: "org_checkout_race" },
		} as never,
		checkoutContext: {
			metadata: {
				id: "metadata_checkout_race",
				type: MetadataType.CheckoutSessionEnabledImmediately,
				data: deferredData,
			},
			stripeCheckoutSession: { id: "checkout_session_race" },
			stripeSubscription: { id: "subscription_race" },
			stripeInvoice: undefined,
		} as never,
	});

	return { expiredCustomerProduct, intendedCustomerProduct };
};

test("checkout completion restores an active pooled product after expiry wins the race", async () => {
	const { expiredCustomerProduct } = await runCompletionAfterExpiry({
		intendedStatus: CusProductStatus.Active,
		intendedEndedAt: null,
	});

	expect(executedAutumnPlan).toMatchObject({
		insertCustomerProducts: [],
		pooledBalanceOps: deferredAutumnPlan.pooledBalanceOps,
		updateCustomerProducts: [
			{
				customerProduct: expiredCustomerProduct,
				updates: {
					status: CusProductStatus.Active,
					ended_at: null,
					subscription_ids: ["subscription_race"],
				},
			},
		],
	});
});

test("checkout completion preserves a scheduled product's intended lifecycle", async () => {
	const intendedEndedAt = 1_900_000_000_000;
	await runCompletionAfterExpiry({
		intendedStatus: CusProductStatus.Scheduled,
		intendedEndedAt,
	});

	expect(
		executedAutumnPlan?.updateCustomerProducts?.[0]?.updates,
	).toMatchObject({
		status: CusProductStatus.Scheduled,
		ended_at: intendedEndedAt,
	});
});
