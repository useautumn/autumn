import { beforeEach, expect, mock, test } from "bun:test";
import { EntInterval, PooledBalanceResetMode } from "@autumn/shared";
import { contexts } from "@tests/utils/fixtures/db/contexts";
import { customerEntitlements } from "@tests/utils/fixtures/db/customerEntitlements";
import { customers } from "@tests/utils/fixtures/db/customers";
import type { InvoiceCreatedContext } from "@/external/stripe/webhookHandlers/handleStripeInvoiceCreated/setupInvoiceCreatedContext";
import type { StripeWebhookContext } from "@/external/stripe/webhookMiddlewares/stripeWebhookContext";
import { mockModuleWithRestore } from "../../utils/mockModuleWithRestore";

const state = {
	computed: true,
	applied: false,
	promoted: false,
	grantedUpdated: false,
};
const invalidateCache = mock(async () => {});

await mockModuleWithRestore(
	"@/internal/customers/actions/resetCustomerEntitlements/processReset",
	() => ({
		processReset: async () =>
			state.computed
				? {
						updates: {
							balance: 10,
							additional_balance: 0,
							adjustment: 0,
							entities: null,
							usage_attribution: {},
							next_reset_at: 3000000,
						},
						pooledContributionsPromoted: state.promoted,
						pooledGranted: state.grantedUpdated ? 10 : undefined,
					}
				: null,
	}),
);
await mockModuleWithRestore("@/internal/balances/utils/sql/client", () => ({
	resetCusEnts: async () => ({
		applied: state.applied ? { pool_123: {} } : {},
		skipped: state.applied ? [] : ["pool_123"],
	}),
}));
await mockModuleWithRestore(
	"@/internal/customers/actions/resetCustomerEntitlements/applyResetResults",
	() => ({
		applyResetResults: async () => ({}),
	}),
);
await mockModuleWithRestore("@/internal/customers/cache/fullSubject", () => ({
	invalidateCachedFullSubject: invalidateCache,
}));

const { resetSubscriptionPooledBalances } = await import(
	"@/external/stripe/webhookHandlers/handleStripeInvoiceCreated/tasks/resetSubscriptionPooledBalances"
);

beforeEach(() => {
	Object.assign(state, {
		computed: true,
		applied: false,
		promoted: false,
		grantedUpdated: false,
	});
	invalidateCache.mockClear();
});

test.each([
	{ computed: false, applied: false, promoted: false, changed: false },
	{ computed: true, applied: false, promoted: false, changed: false },
	{ computed: true, applied: true, promoted: false, changed: true },
	{ computed: true, applied: false, promoted: true, changed: true },
	{
		computed: true,
		applied: false,
		promoted: false,
		grantedUpdated: true,
		changed: true,
	},
])(
	"pooled resets report applied changes rather than attempted resets: %j",
	async (scenario) => {
		Object.assign(state, scenario);
		const pool = customerEntitlements.create({
			id: "pool_123",
			featureId: "messages",
			featureName: "Messages",
			allowance: 10,
			balance: 5,
			interval: EntInterval.Month,
			nextResetAt: 2000000,
		});
		pool.pooled_balance = {
			id: "pool_balance_123",
			reset_mode: PooledBalanceResetMode.Subscription,
			stripe_subscription_id: "sub_123",
		} as NonNullable<typeof pool.pooled_balance>;
		const fullCustomer = customers.create({});
		fullCustomer.pooled_customer_entitlements = [pool];
		const eventContext = {
			fullCustomer,
			stripeInvoice: { billing_reason: "subscription_cycle", period_end: 2000 },
			stripeSubscriptionId: "sub_123",
			billingCycleAnchorResetCustomerProductIds: [],
			results: { customerStateChanged: false },
		} as unknown as InvoiceCreatedContext;
		await resetSubscriptionPooledBalances({
			ctx: contexts.create({}) as StripeWebhookContext,
			eventContext,
		});
		expect(eventContext.results.customerStateChanged).toBe(scenario.changed);
		expect(invalidateCache).toHaveBeenCalledTimes(
			scenario.applied || scenario.promoted ? 1 : 0,
		);
	},
);
