// Red criterion: external cancellation would leave stale license state in customers.get.
// Green: end-of-cycle is canceling; immediate cancel removes the parent and license pool.
import { test } from "bun:test";
import type { ApiCustomerV5 } from "@autumn/shared";
import { createExternalStripeSubscription } from "@tests/integration/billing/stripe-webhooks/utils/sharedStripeProductAutoSyncUtils";
import { getBaseStripePriceId } from "@tests/integration/billing/sync/utils/syncProductHelpers";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectCustomerLicenses } from "@tests/integration/licenses/utils/expectCustomerLicenses";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { timeout } from "@tests/utils/genUtils";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { ProductService } from "@/internal/products/ProductService";

const PAID_SEATS = 3;

type AutumnV2_3 = Awaited<ReturnType<typeof initScenario>>["autumnV2_3"];

const waitForCustomerState = async ({
	autumnV2_3,
	customerId,
	assertState,
}: {
	autumnV2_3: AutumnV2_3;
	customerId: string;
	assertState: (customer: ApiCustomerV5) => void | Promise<void>;
}) => {
	const deadline = Date.now() + 60_000;
	let lastError: unknown;

	while (Date.now() < deadline) {
		try {
			const customer =
				await autumnV2_3.customers.get<ApiCustomerV5>(customerId);
			await assertState(customer);
			return customer;
		} catch (error) {
			lastError = error;
			await timeout(2_000);
		}
	}

	throw lastError;
};

const setupBackSyncedLicenseSubscription = async ({
	customerId,
	idPrefix,
}: {
	customerId: string;
	idPrefix: string;
}) => {
	const pro = products.base({
		id: `${idPrefix}-pro`,
		items: [items.dashboard()],
	});
	const devSeat = products.base({
		id: `${idPrefix}-dev-seat`,
		group: `${idPrefix}-dev-seat-licenses`,
		items: [
			items.monthlyPrice({ price: 20 }),
			items.monthlyMessages({ includedUsage: 100 }),
		],
	});

	const { autumnV2_3 } = await initScenario({
		customerId,
		ctx,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, devSeat] }),
		],
		actions: [
			s.licenses.link({
				parentProductId: pro.id,
				licenseProductId: devSeat.id,
				included: 0,
			}),
		],
	});
	const fullDevSeat = await ProductService.getFull({
		db: ctx.db,
		idOrInternalId: devSeat.id,
		orgId: ctx.org.id,
		env: ctx.env,
	});
	const stripeSubscription = await createExternalStripeSubscription({
		ctx,
		customerId,
		items: [
			{
				price: getBaseStripePriceId({ fullProduct: fullDevSeat }),
				quantity: PAID_SEATS,
			},
		],
	});

	await waitForCustomerState({
		autumnV2_3,
		customerId,
		assertState: async (customer) => {
			await expectCustomerProducts({ customer, active: [pro.id] });
			expectCustomerLicenses({
				customer,
				count: 1,
				licenses: [
					{
						license_plan_id: devSeat.id,
						parent_plan_id: pro.id,
						paid_quantity: PAID_SEATS,
						granted: PAID_SEATS,
						usage: 0,
						remaining: PAID_SEATS,
					},
				],
			});
		},
	});

	return { autumnV2_3, pro, devSeat, stripeSubscription };
};

test(`${chalk.yellowBright("license webhook cancel: Stripe end-of-cycle is canceling in customers.get")}`, async () => {
	const customerId = "license-webhook-cancel-end-of-cycle";
	const { autumnV2_3, pro, devSeat, stripeSubscription } =
		await setupBackSyncedLicenseSubscription({
			customerId,
			idPrefix: "license-webhook-eoc",
		});

	await ctx.stripeCli.subscriptions.update(stripeSubscription.id, {
		cancel_at_period_end: true,
	});

	await waitForCustomerState({
		autumnV2_3,
		customerId,
		assertState: async (customer) => {
			await expectCustomerProducts({ customer, canceling: [pro.id] });
			expectCustomerLicenses({
				customer,
				count: 1,
				licenses: [
					{
						license_plan_id: devSeat.id,
						parent_plan_id: pro.id,
						paid_quantity: PAID_SEATS,
					},
				],
			});
		},
	});
});

test(`${chalk.yellowBright("license webhook cancel: Stripe immediate cancel is absent in customers.get")}`, async () => {
	const customerId = "license-webhook-cancel-immediate";
	const { autumnV2_3, pro, stripeSubscription } =
		await setupBackSyncedLicenseSubscription({
			customerId,
			idPrefix: "license-webhook-immediate",
		});

	await ctx.stripeCli.subscriptions.cancel(stripeSubscription.id);

	await waitForCustomerState({
		autumnV2_3,
		customerId,
		assertState: async (customer) => {
			await expectCustomerProducts({ customer, notPresent: [pro.id] });
			expectCustomerLicenses({ customer, count: 0, licenses: [] });
		},
	});
});
