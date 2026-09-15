/**
 * Auto top-ups charge through a TIERED one-off prepaid price, pricing the
 * configured top-up quantity through the item's own tiers.
 *
 * Contract:
 *   - a volume-tiered one-off prepaid price is a valid top-up charge source:
 *     the whole quantity is billed at the single tier it lands in.
 *   - a graduated one-off prepaid price is a valid top-up charge source: the
 *     quantity is billed band by band.
 *   - manual top-ups (`subscriptions.update` + `feature_quantities`) price a
 *     volume one-off item the same way.
 *   - balance, invoice and `options.quantity` side effects match flat-price
 *     top-ups.
 *
 * Tiers (per credit): ≤75 @ $0.22, ≤125 @ $0.20, ≤250 @ $0.18, then $0.17.
 *   volume 250     = 250 × 0.18                       = $45
 *   graduated 250  = 75 × 0.22 + 50 × 0.20 + 125 × 0.18 = $49
 *   volume 125     = 125 × 0.20                       = $25
 *
 * Red (current):  the tiered one-off price is skipped as a charge source, so no
 *                 top-up fires and the manual top-up throws "cusEnt not found".
 * Green (after):  the top-up fires and the invoice carries the tiered amount.
 */

import { test } from "bun:test";
import type {
	ApiCustomerV5,
	UpdateSubscriptionV1ParamsInput,
} from "@autumn/shared";
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
const ON_ENABLED_TOPUP_WAIT_MS = 40000;

const PER_CREDIT_TIERS = [
	{ to: 75, amount: 0.22 },
	{ to: 125, amount: 0.2 },
	{ to: 250, amount: 0.18 },
	{ to: "inf" as const, amount: 0.17 },
];

const VOLUME_250_TOTAL = 45;
const GRADUATED_250_TOTAL = 49;
const VOLUME_125_TOTAL = 25;
const PRO_BASE_PRICE = 20;

test.concurrent(
	`${chalk.yellowBright("auto-topup tiered 1: a VOLUME one-off price bills the top-up quantity at its tier's rate")}`,
	async () => {
		const addOn = products.oneOffAddOn({
			id: "topup-tiered-volume",
			items: [
				items.volumeOneOffMessages({
					billingUnits: 1,
					tiers: PER_CREDIT_TIERS,
				}),
			],
		});

		const { customerId, autumnV2_3, ctx } = await initScenario({
			customerId: "auto-topup-tiered-volume",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [addOn] }),
			],
			actions: [
				s.billing.attach({
					productId: addOn.id,
					options: [{ feature_id: TestFeature.Messages, quantity: 250 }],
				}),
			],
		});

		await autumnV2_3.customers.update(customerId, {
			billing_controls: makeAutoTopupConfig({ threshold: 20, quantity: 250 }),
		});

		// 250 - 240 = 10 (below threshold 20) -> top-up 250 at $0.18 -> 260.
		await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 240,
		});
		await timeout(AUTO_TOPUP_WAIT_MS);

		const after = await autumnV2_3.customers.get<ApiCustomerV5>(customerId);
		expectBalanceCorrect({
			customer: after,
			featureId: TestFeature.Messages,
			remaining: new Decimal(250).sub(240).add(250).toNumber(),
		});
		await expectCustomerInvoiceCorrect({
			customerId,
			count: 2,
			latestTotal: VOLUME_250_TOTAL,
			latestStatus: "paid",
			latestInvoiceProductId: addOn.id,
		});
		await expectCustomerProductOptions({
			ctx,
			customerId,
			productId: addOn.id,
			featureId: TestFeature.Messages,
			quantity: 500,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("auto-topup tiered 2: a GRADUATED one-off price on a recurring plan bills the top-up band by band")}`,
	async () => {
		const plan = products.pro({
			id: "topup-tiered-graduated",
			items: [
				items.tieredOneOffMessages({
					billingUnits: 1,
					tiers: PER_CREDIT_TIERS,
				}),
			],
		});

		const { customerId, autumnV2_3, ctx } = await initScenario({
			customerId: "auto-topup-tiered-graduated",
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

		// Balance 0 is below threshold 20, so enabling fires the top-up at once.
		await autumnV2_3.customers.update(customerId, {
			billing_controls: makeAutoTopupConfig({ threshold: 20, quantity: 250 }),
		});
		await timeout(ON_ENABLED_TOPUP_WAIT_MS);

		const after = await autumnV2_3.customers.get<ApiCustomerV5>(customerId);
		expectBalanceCorrect({
			customer: after,
			featureId: TestFeature.Messages,
			remaining: 250,
		});
		await expectCustomerInvoiceCorrect({
			customerId,
			count: 2,
			latestTotal: GRADUATED_250_TOTAL,
			latestStatus: "paid",
			latestInvoiceProductId: plan.id,
		});
		await expectCustomerProductOptions({
			ctx,
			customerId,
			productId: plan.id,
			featureId: TestFeature.Messages,
			quantity: 250,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("auto-topup tiered 3: a MANUAL top-up on a volume one-off price bills the quantity at its tier's rate")}`,
	async () => {
		const plan = products.pro({
			id: "topup-tiered-manual",
			items: [
				items.volumeOneOffMessages({
					billingUnits: 1,
					tiers: PER_CREDIT_TIERS,
				}),
			],
		});

		const { customerId, autumnV2_3, ctx } = await initScenario({
			customerId: "auto-topup-tiered-manual",
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

		await expectCustomerInvoiceCorrect({
			customerId,
			count: 1,
			latestTotal: PRO_BASE_PRICE,
		});

		await autumnV2_3.subscriptions.update<UpdateSubscriptionV1ParamsInput>({
			customer_id: customerId,
			plan_id: plan.id,
			feature_quantities: [{ feature_id: TestFeature.Messages, quantity: 125 }],
		});

		const after = await autumnV2_3.customers.get<ApiCustomerV5>(customerId);
		expectBalanceCorrect({
			customer: after,
			featureId: TestFeature.Messages,
			remaining: 125,
		});
		await expectCustomerInvoiceCorrect({
			customerId,
			count: 2,
			latestTotal: VOLUME_125_TOTAL,
			latestStatus: "paid",
			latestInvoiceProductId: plan.id,
		});
		await expectCustomerProductOptions({
			ctx,
			customerId,
			productId: plan.id,
			featureId: TestFeature.Messages,
			quantity: 125,
		});
	},
);
