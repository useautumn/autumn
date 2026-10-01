import { beforeEach, expect, mock, test } from "bun:test";
import { CusProductStatus, type FullCusProduct } from "@autumn/shared";
import { contexts } from "@tests/utils/fixtures/db/contexts";
import { customerEntitlements } from "@tests/utils/fixtures/db/customerEntitlements";
import { customerProducts } from "@tests/utils/fixtures/db/customerProducts";
import type { StripeSubscriptionDeletedContext } from "@/external/stripe/webhookHandlers/handleStripeSubscriptionDeleted/setupStripeSubscriptionDeletedContext";
import type { StripeSubscriptionUpdatedContext } from "@/external/stripe/webhookHandlers/handleStripeSubscriptionUpdated/stripeSubscriptionUpdatedContext";
import type { StripeWebhookContext } from "@/external/stripe/webhookMiddlewares/stripeWebhookContext";
import { customerProductActions } from "@/internal/customers/cusProducts/actions";
import { mockModuleWithRestore } from "../../utils/mockModuleWithRestore";

let cachedProducts: FullCusProduct[] = [];
const order: string[] = [];
const publish = mock(async (params: { customerProducts: FullCusProduct[] }) => {
	await Promise.resolve();
	cachedProducts = structuredClone(params.customerProducts);
	order.push("publish");
});

await mockModuleWithRestore("@/internal/customers/cusProducts/actions", () => ({
	customerProductActions: {
		...customerProductActions,
		expiredCache: { ...customerProductActions.expiredCache, set: publish },
		preserveOneOffPrepaid: async () => ({ preservedCount: 0 }),
	},
}));
await mockModuleWithRestore("@/external/stripe/webhookHandlers/common", () => ({
	expireAndActivateWithTracking: async ({
		customerProduct,
	}: {
		customerProduct: FullCusProduct;
	}) => {
		order.push(`expire:${customerProduct.id}`);
		expect(cachedProducts.map((product) => product.id)).toEqual([
			"customer-plan",
			"entity-plan",
		]);
		expect(
			cachedProducts.find((product) => product.id === customerProduct.id),
		).toEqual({ ...customerProduct, status: CusProductStatus.Expired });
		return {
			expiredCustomerProduct: {
				...customerProduct,
				status: CusProductStatus.Expired,
			},
		};
	},
}));
await mockModuleWithRestore(
	"@/internal/billing/v2/pooledBalances/execute/applyPooledBalanceCustomerProductTransitions",
	() => ({ applyPooledBalanceCustomerProductTransitions: async () => {} }),
);

const { expireAndActivateCustomerProducts } = await import(
	"@/external/stripe/webhookHandlers/handleStripeSubscriptionDeleted/tasks/expireAndActivateCustomerProducts"
);
const { expireEndedCustomerProducts } = await import(
	"@/external/stripe/webhookHandlers/handleStripeSubscriptionUpdated/tasks/handleSchedulePhaseChanges/expireEndedCustomerProducts"
);

beforeEach(() => {
	cachedProducts = [];
	order.length = 0;
	publish.mockClear();
});

for (const eventType of ["deleted", "updated"] as const) {
	test(`subscription.${eventType} publishes every final-usage snapshot before expiring any product`, async () => {
		const nowMs = 2_000_000;
		const plans = ["customer-plan", "entity-plan"].map((id, index) =>
			customerProducts.create({
				id,
				startsAt: 1_000_000,
				endedAt: nowMs,
				internalEntityId: index === 1 ? "entity-internal" : undefined,
				subscriptionIds: ["sub_handoff"],
				customerEntitlements: [
					customerEntitlements.create({
						id: `${id}-messages`,
						featureId: "messages",
						featureName: "Messages",
						allowance: 100,
						balance: index === 0 ? -200 : -150,
					}),
				],
			}),
		);
		const ctx = contexts.create({}) as StripeWebhookContext;
		const eventContext = {
			customerProducts: plans,
			fullCustomer: contexts.createBilling({ customerProducts: plans })
				.fullCustomer,
			stripeSubscription: { id: "sub_handoff" },
			nowMs,
			oneOffPrepaidCarryOvers: [],
		};
		if (eventType === "deleted") {
			await expireAndActivateCustomerProducts({
				ctx,
				eventContext:
					eventContext as unknown as StripeSubscriptionDeletedContext,
			});
		} else {
			await expireEndedCustomerProducts({
				ctx,
				eventContext:
					eventContext as unknown as StripeSubscriptionUpdatedContext,
			});
		}
		expect(order).toEqual([
			"publish",
			"expire:customer-plan",
			"expire:entity-plan",
		]);
		expect(publish).toHaveBeenCalledTimes(1);
		expect(plans.every((plan) => plan.status === CusProductStatus.Active)).toBe(
			true,
		);
	});
}
