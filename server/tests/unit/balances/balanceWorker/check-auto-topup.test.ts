import { afterEach, expect, test } from "bun:test";
import { catalogRowsToCatalog } from "@autumn/balance-engine";
import type { BalanceWorkerClient } from "@autumn/balance-worker-client";
import { BillingInterval, BillWhen, type CheckParams } from "@autumn/shared";
import { prices } from "@tests/utils/fixtures/db/prices.js";
import { mockModuleWithRestore } from "../../utils/mockModuleWithRestore.js";

const dispatched: { customerId: string; featureId: string }[] = [];
await mockModuleWithRestore(
	"@/internal/balances/autoTopUp/helpers/dispatchAutoTopup.js",
	() => ({
		dispatchAutoTopup: async ({
			customerId,
			featureId,
		}: {
			customerId: string;
			featureId: string;
		}) => {
			dispatched.push({ customerId, featureId });
			return { enqueued: true, reason: "enqueued" };
		},
	}),
);

const { fullSubjectToCatalogRows, fullSubjectToSubjectState } = await import(
	"@/internal/balances/balanceWorker/fullSubjectToSubjectState.js"
);
const { runBalanceWorkerCheck } = await import(
	"@/internal/balances/check/balanceWorker/runBalanceWorkerCheck.js"
);
const { createCustomerFixture } = await import("./customer-fixture.js");

afterEach(() => {
	dispatched.length = 0;
});

/** The fixture's plan, with a one-off prepaid price on its row and an enabled config on the customer. */
const topUpFixture = ({
	balance,
	threshold,
}: {
	balance: number;
	threshold: number;
}) => {
	const fixture = createCustomerFixture();
	const { ctx, fullSubject, customerProduct, customerEntitlement, customer } =
		fixture;
	customerProduct.customer_prices = [
		prices.createCustomer({
			customerProductId: customerProduct.id,
			price: prices.buildUsage({
				overrides: {
					id: "topup_price",
					entitlement_id: customerEntitlement.entitlement_id,
				},
				configOverrides: {
					bill_when: BillWhen.InAdvance,
					interval: BillingInterval.OneOff,
				},
			}),
		}),
	];
	customer.auto_topups = [
		{ feature_id: "messages", enabled: true, threshold, quantity: 100 },
	];
	customerEntitlement.balance = balance;
	const state = fullSubjectToSubjectState({
		ctx,
		fullSubject,
		featureIds: ["messages"],
	});
	const catalog = catalogRowsToCatalog({
		rows: fullSubjectToCatalogRows({
			ctx,
			fullSubject,
			featureIds: ["messages"],
		}),
	});
	return { ctx, state, catalog };
};

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

const clientAnswering = ({
	state,
	catalog,
	fundingFeatureId,
}: {
	state: ReturnType<typeof topUpFixture>["state"];
	catalog: ReturnType<typeof topUpFixture>["catalog"];
	fundingFeatureId: string | null;
}): Pick<BalanceWorkerClient, "check" | "track"> => ({
	track: async () => {
		throw new Error("This fixture never tracks");
	},
	check: async () => ({
		result: {
			allowed: true,
			reason: null,
			limitType: null,
			requiredBalance: 1,
			fundingFeatureId,
			isFlag: false,
		},
		state,
		catalog,
	}),
});

const body: CheckParams = { customer_id: "cus_test", feature_id: "messages" };

test("a worker-path check at or under the threshold dispatches once for the funding feature", async () => {
	const { ctx, state, catalog } = topUpFixture({ balance: 0, threshold: 20 });
	await runBalanceWorkerCheck({
		ctx,
		body,
		client: clientAnswering({ state, catalog, fundingFeatureId: "messages" }),
	});
	await flush();
	expect(dispatched).toEqual([
		{ customerId: "cus_test", featureId: "messages" },
	]);
});

test("a check above the threshold dispatches nothing", async () => {
	const { ctx, state, catalog } = topUpFixture({ balance: 50, threshold: 20 });
	await runBalanceWorkerCheck({
		ctx,
		body,
		client: clientAnswering({ state, catalog, fundingFeatureId: "messages" }),
	});
	await flush();
	expect(dispatched).toEqual([]);
});

test("a deducting check dispatches nothing from the server: its record reaches herald", async () => {
	const { ctx, state, catalog } = topUpFixture({ balance: 0, threshold: 20 });
	const client = clientAnswering({
		state,
		catalog,
		fundingFeatureId: "messages",
	});
	await runBalanceWorkerCheck({
		ctx,
		body: { ...body, send_event: true },
		client: {
			...client,
			track: async () => ({
				result: {
					status: "applied",
					deltas: [],
					deductions: [],
					fundingFeatureId: "messages",
					internalProductId: null,
					fundingCreditCost: 1,
				},
				state,
				catalog,
			}),
		} as never,
	});
	await flush();
	expect(dispatched).toEqual([]);
});

test("a check on an unattached feature dispatches nothing", async () => {
	const { ctx, state, catalog } = topUpFixture({ balance: 0, threshold: 20 });
	await runBalanceWorkerCheck({
		ctx,
		body,
		client: clientAnswering({ state, catalog, fundingFeatureId: null }),
	});
	await flush();
	expect(dispatched).toEqual([]);
});
