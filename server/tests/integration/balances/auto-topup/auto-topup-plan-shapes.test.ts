/**
 * Auto top-ups across the plan shapes a credits catalog actually uses:
 *   1. fixed plan: free monthly allowance + FLAT one-off refill on the same plan
 *   2. base plan with a free allowance + VOLUME one-off refill on an add-on
 *   3. base plan with a free allowance + GRADUATED one-off refill on an add-on
 *   4. one plan hosting BOTH a monthly volume prepaid item and the volume
 *      one-off refill item for the same feature
 *
 * Contract:
 *   - the refill charge is the configured top-up quantity priced through the
 *     refill item's tiers, never shifted by sibling allowances
 *   - in shape 4 the monthly prepaid item owns the feature-keyed
 *     `options.quantity`, so the refill must leave it untouched (500 stays
 *     500) while still granting the credits and invoicing the refill
 *
 * Tiers per credit: ≤75 @ $0.22, ≤125 @ $0.20, ≤250 @ $0.18, then $0.17.
 *   volume 125    = 125 × 0.20                         = $25
 *   graduated 250 = 75 × 0.22 + 50 × 0.20 + 125 × 0.18 = $49
 *
 * Red (current):  shape 4 never refills — the one-off price loses the
 *                 prepaid quantity tie-break, so the charge computes to $0.
 * Green (after):  every shape refills and invoices the tiered amount.
 */

import { test } from "bun:test";
import type { ApiCustomerV3, ApiCustomerV5 } from "@autumn/shared";
import { makeAutoTopupConfig } from "@tests/integration/balances/auto-topup/utils/makeAutoTopupConfig.js";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect.js";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect.js";
import { expectCustomerProductOptions } from "@tests/integration/utils/expectCustomerProductOptions.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { timeout } from "@tests/utils/genUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { Decimal } from "decimal.js";

const AUTO_TOPUP_WAIT_MS = 20000;

const REFILL_TIERS = [
	{ to: 75, amount: 0.22 },
	{ to: 125, amount: 0.2 },
	{ to: 250, amount: 0.18 },
	{ to: "inf" as const, amount: 0.17 },
];

const MONTHLY_VOLUME_TIERS = [
	{ to: 300, amount: 0, flat_amount: 66 },
	{ to: 500, amount: 0, flat_amount: 100 },
	{ to: 1000, amount: 0, flat_amount: 180 },
	{ to: "inf" as const, amount: 0, flat_amount: 340 },
];

const FLAT_REFILL_10_TOTAL = 4;
const VOLUME_125_TOTAL = 25;
const GRADUATED_250_TOTAL = 49;
const MONTHLY_500_TOTAL = 100;

const volumeRefill = () =>
	items.volumeOneOffMessages({ billingUnits: 1, tiers: REFILL_TIERS });
const graduatedRefill = () =>
	items.tieredOneOffMessages({ billingUnits: 1, tiers: REFILL_TIERS });

const invoiceCount = async ({
	customerId,
	autumn,
}: {
	customerId: string;
	autumn: { customers: { get: <T>(id: string) => Promise<T> } };
}) => {
	const customer = await autumn.customers.get<ApiCustomerV3>(customerId);
	return customer.invoices?.length ?? 0;
};

test.concurrent(
	`${chalk.yellowBright("auto-topup shape 1: free monthly allowance + FLAT one-off refill on one plan")}`,
	async () => {
		const plan = products.base({
			id: "shape-fixed",
			items: [
				items.monthlyPrice({ price: 10 }),
				items.monthlyMessages({ includedUsage: 25 }),
				items.oneOffMessages({ billingUnits: 1, price: 0.4 }),
			],
		});

		const { customerId, autumnV1, autumnV2_3 } = await initScenario({
			customerId: "auto-topup-shape-fixed",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [plan] }),
			],
			actions: [
				s.billing.attach({
					productId: plan.id,
					options: [{ feature_id: TestFeature.Messages, quantity: 0 }],
				}),
			],
		});

		await autumnV2_3.customers.update(customerId, {
			billing_controls: makeAutoTopupConfig({ threshold: 5, quantity: 10 }),
		});
		const invoicesBefore = await invoiceCount({ customerId, autumn: autumnV1 });

		// 25 - 21 = 4 (below threshold 5) -> refill 10 at $0.40 -> 14.
		await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 21,
		});
		await timeout(AUTO_TOPUP_WAIT_MS);

		const after = await autumnV2_3.customers.get<ApiCustomerV5>(customerId);
		expectBalanceCorrect({
			customer: after,
			featureId: TestFeature.Messages,
			remaining: new Decimal(25).sub(21).add(10).toNumber(),
		});
		await expectCustomerInvoiceCorrect({
			customerId,
			count: invoicesBefore + 1,
			latestTotal: FLAT_REFILL_10_TOTAL,
			latestStatus: "paid",
			latestInvoiceProductId: plan.id,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("auto-topup shape 2: free allowance on the base plan + VOLUME refill on an add-on")}`,
	async () => {
		const base = products.base({
			id: "shape-volume-base",
			items: [
				items.monthlyPrice({ price: 66 }),
				items.monthlyMessages({ includedUsage: 300 }),
			],
		});
		const addOn = products.oneOffAddOn({
			id: "shape-volume-addon",
			items: [volumeRefill()],
		});

		const { customerId, autumnV1, autumnV2_3, ctx } = await initScenario({
			customerId: "auto-topup-shape-volume",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [base, addOn] }),
			],
			actions: [
				s.billing.attach({ productId: base.id }),
				s.billing.attach({
					productId: addOn.id,
					options: [{ feature_id: TestFeature.Messages, quantity: 0 }],
				}),
			],
		});

		await autumnV2_3.customers.update(customerId, {
			billing_controls: makeAutoTopupConfig({ threshold: 50, quantity: 125 }),
		});
		const invoicesBefore = await invoiceCount({ customerId, autumn: autumnV1 });

		// 300 - 260 = 40 (below threshold 50) -> refill 125 at $0.20 -> 165.
		await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 260,
		});
		await timeout(AUTO_TOPUP_WAIT_MS);

		const after = await autumnV2_3.customers.get<ApiCustomerV5>(customerId);
		expectBalanceCorrect({
			customer: after,
			featureId: TestFeature.Messages,
			remaining: new Decimal(300).sub(260).add(125).toNumber(),
		});
		await expectCustomerInvoiceCorrect({
			customerId,
			count: invoicesBefore + 1,
			latestTotal: VOLUME_125_TOTAL,
			latestStatus: "paid",
			latestInvoiceProductId: addOn.id,
		});
		await expectCustomerProductOptions({
			ctx,
			customerId,
			productId: addOn.id,
			featureId: TestFeature.Messages,
			quantity: 125,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("auto-topup shape 3: free allowance on the base plan + GRADUATED refill on an add-on")}`,
	async () => {
		const base = products.base({
			id: "shape-graduated-base",
			items: [
				items.monthlyPrice({ price: 66 }),
				items.monthlyMessages({ includedUsage: 300 }),
			],
		});
		const addOn = products.oneOffAddOn({
			id: "shape-graduated-addon",
			items: [graduatedRefill()],
		});

		const { customerId, autumnV1, autumnV2_3 } = await initScenario({
			customerId: "auto-topup-shape-graduated",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [base, addOn] }),
			],
			actions: [
				s.billing.attach({ productId: base.id }),
				s.billing.attach({
					productId: addOn.id,
					options: [{ feature_id: TestFeature.Messages, quantity: 0 }],
				}),
			],
		});

		await autumnV2_3.customers.update(customerId, {
			billing_controls: makeAutoTopupConfig({ threshold: 50, quantity: 250 }),
		});
		const invoicesBefore = await invoiceCount({ customerId, autumn: autumnV1 });

		// 300 - 260 = 40 (below threshold 50) -> refill 250 banded -> 290.
		await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 260,
		});
		await timeout(AUTO_TOPUP_WAIT_MS);

		const after = await autumnV2_3.customers.get<ApiCustomerV5>(customerId);
		expectBalanceCorrect({
			customer: after,
			featureId: TestFeature.Messages,
			remaining: new Decimal(300).sub(260).add(250).toNumber(),
		});
		await expectCustomerInvoiceCorrect({
			customerId,
			count: invoicesBefore + 1,
			latestTotal: GRADUATED_250_TOTAL,
			latestStatus: "paid",
			latestInvoiceProductId: addOn.id,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("auto-topup shape 4: monthly VOLUME prepaid + volume one-off refill on the SAME plan")}`,
	async () => {
		const plan = products.base({
			id: "shape-same-plan",
			items: [
				items.volumePrepaidMessages({
					billingUnits: 1,
					tiers: MONTHLY_VOLUME_TIERS,
				}),
				volumeRefill(),
			],
		});

		const { customerId, autumnV2_3, ctx } = await initScenario({
			customerId: "auto-topup-shape-same-plan",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [plan] }),
			],
			actions: [
				s.billing.attach({
					productId: plan.id,
					options: [{ feature_id: TestFeature.Messages, quantity: 500 }],
				}),
			],
		});

		// The monthly prepaid item owns the feature quantity: 500 credits = $100.
		await expectCustomerInvoiceCorrect({
			customerId,
			count: 1,
			latestTotal: MONTHLY_500_TOTAL,
		});

		await autumnV2_3.customers.update(customerId, {
			billing_controls: makeAutoTopupConfig({ threshold: 50, quantity: 125 }),
		});

		// 500 - 460 = 40 (below threshold 50) -> refill 125 at $0.20 -> 165.
		await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 460,
		});
		await timeout(AUTO_TOPUP_WAIT_MS);

		const after = await autumnV2_3.customers.get<ApiCustomerV5>(customerId);
		expectBalanceCorrect({
			customer: after,
			featureId: TestFeature.Messages,
			remaining: new Decimal(500).sub(460).add(125).toNumber(),
		});
		await expectCustomerInvoiceCorrect({
			customerId,
			count: 2,
			latestTotal: VOLUME_125_TOTAL,
			latestStatus: "paid",
			latestInvoiceProductId: plan.id,
		});
		// The refill must not inflate the monthly prepaid quantity.
		await expectCustomerProductOptions({
			ctx,
			customerId,
			productId: plan.id,
			featureId: TestFeature.Messages,
			quantity: 500,
		});
	},
);
