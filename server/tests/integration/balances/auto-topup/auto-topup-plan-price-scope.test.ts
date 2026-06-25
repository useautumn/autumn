/**
 * Auto-topup price scoping across plans.
 *
 * Two plans both carry a one-off prepaid price for the SAME feature at DIFFERENT
 * unit prices.
 *  - PLAN-level config: charge the price ON THE PLAN THAT HAS THE CONTROL —
 *    never the other plan's price for the same feature.
 *  - CUSTOMER-level config (no source plan): charge the MOST RECENTLY attached
 *    plan's one-off price.
 *
 * Discriminator: the top-up invoice total + the product it bills against.
 */

import { test } from "bun:test";
import type { ApiCustomerV5 } from "@autumn/shared";
import { makeAutoTopupConfig } from "@tests/integration/balances/auto-topup/utils/makeAutoTopupConfig";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { timeout } from "@tests/utils/genUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { Decimal } from "decimal.js";

const AUTO_TOPUP_WAIT_MS = 20000;
const BURST_SUPPRESSION_TTL_MS = 35000;

// One pack = 100 units; quantity 100 tops up exactly one pack, so the invoice
// total equals the plan's per-pack price — the discriminator between plans.
const oneOffItem = (price: number) =>
	items.oneOffMessages({ includedUsage: 0, billingUnits: 100, price });

test(
	`${chalk.yellowBright("topup-price-scope: control on the PRICIER plan charges that plan's price, not the cheaper plan's")}`,
	async () => {
		// Cheaper plan ($5/pack), NO control. Pricier add-on ($10/pack) HAS control.
		const cheapPlan = products.oneOffAddOn({
			id: "topup-price-cheap-no-control",
			items: [oneOffItem(5)],
		});
		const pricyPlanWithControl = products.oneOffAddOn({
			id: "topup-price-pricy-with-control",
			items: [oneOffItem(10)],
			billingControls: makeAutoTopupConfig({ threshold: 20, quantity: 100 }),
		});

		const { customerId, autumnV2_1 } = await initScenario({
			customerId: "topup-price-scope-pricier",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [cheapPlan, pricyPlanWithControl] }),
			],
			actions: [
				s.billing.attach({
					productId: cheapPlan.id,
					options: [{ feature_id: TestFeature.Messages, quantity: 100 }],
				}),
				s.billing.attach({
					productId: pricyPlanWithControl.id,
					options: [{ feature_id: TestFeature.Messages, quantity: 0 }],
				}),
			],
		});

		await timeout(BURST_SUPPRESSION_TTL_MS);

		// 100 - 85 = 15 (< threshold 20) -> top-up of 100 fires.
		await autumnV2_1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 85,
		});
		await timeout(AUTO_TOPUP_WAIT_MS);

		const after = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
		expectBalanceCorrect({
			customer: after,
			featureId: TestFeature.Messages,
			remaining: new Decimal(100).sub(85).add(100).toNumber(),
		});

		// MUST be billed against the control plan's $10 price (not the $5 plan).
		await expectCustomerInvoiceCorrect({
			customerId,
			count: 3,
			latestTotal: 10,
			latestStatus: "paid",
			latestInvoiceProductId: pricyPlanWithControl.id,
		});
	},
);

test(
	`${chalk.yellowBright("topup-price-scope: control on the CHEAPER plan charges that plan's price, not the pricier plan's")}`,
	async () => {
		// Cheaper plan ($5/pack) HAS control. Pricier add-on ($10/pack), NO control.
		const cheapPlanWithControl = products.oneOffAddOn({
			id: "topup-price-cheap-with-control",
			items: [oneOffItem(5)],
			billingControls: makeAutoTopupConfig({ threshold: 20, quantity: 100 }),
		});
		const pricyPlan = products.oneOffAddOn({
			id: "topup-price-pricy-no-control",
			items: [oneOffItem(10)],
		});

		const { customerId, autumnV2_1 } = await initScenario({
			customerId: "topup-price-scope-cheaper",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [cheapPlanWithControl, pricyPlan] }),
			],
			actions: [
				s.billing.attach({
					productId: cheapPlanWithControl.id,
					options: [{ feature_id: TestFeature.Messages, quantity: 100 }],
				}),
				s.billing.attach({
					productId: pricyPlan.id,
					options: [{ feature_id: TestFeature.Messages, quantity: 0 }],
				}),
			],
		});

		await timeout(BURST_SUPPRESSION_TTL_MS);

		await autumnV2_1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 85,
		});
		await timeout(AUTO_TOPUP_WAIT_MS);

		const after = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
		expectBalanceCorrect({
			customer: after,
			featureId: TestFeature.Messages,
			remaining: new Decimal(100).sub(85).add(100).toNumber(),
		});

		// MUST be billed against the control plan's $5 price (not the $10 plan).
		await expectCustomerInvoiceCorrect({
			customerId,
			count: 3,
			latestTotal: 5,
			latestStatus: "paid",
			latestInvoiceProductId: cheapPlanWithControl.id,
		});
	},
);

test(
	`${chalk.yellowBright("topup-price-scope: a CUSTOMER-level config charges the most recently attached plan's price")}`,
	async () => {
		// Neither plan has a control; the config is set at the CUSTOMER level. The
		// pricier plan ($10) is attached LAST -> its price must be used.
		const cheapPlan = products.oneOffAddOn({
			id: "topup-price-cus-cheap",
			items: [oneOffItem(5)],
		});
		const pricyPlanRecent = products.oneOffAddOn({
			id: "topup-price-cus-pricy-recent",
			items: [oneOffItem(10)],
		});

		const { customerId, autumnV2_1 } = await initScenario({
			customerId: "topup-price-scope-customer",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [cheapPlan, pricyPlanRecent] }),
			],
			actions: [
				s.billing.attach({
					productId: cheapPlan.id,
					options: [{ feature_id: TestFeature.Messages, quantity: 100 }],
				}),
				// Pricier plan attached LAST -> most recent.
				s.billing.attach({
					productId: pricyPlanRecent.id,
					options: [{ feature_id: TestFeature.Messages, quantity: 0 }],
				}),
			],
		});

		await autumnV2_1.customers.update(customerId, {
			billing_controls: makeAutoTopupConfig({ threshold: 20, quantity: 100 }),
		});
		await timeout(BURST_SUPPRESSION_TTL_MS);

		await autumnV2_1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 85,
		});
		await timeout(AUTO_TOPUP_WAIT_MS);

		const after = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
		expectBalanceCorrect({
			customer: after,
			featureId: TestFeature.Messages,
			remaining: new Decimal(100).sub(85).add(100).toNumber(),
		});

		// Most recently attached plan is the $10 one -> charge $10.
		await expectCustomerInvoiceCorrect({
			customerId,
			count: 3,
			latestTotal: 10,
			latestStatus: "paid",
			latestInvoiceProductId: pricyPlanRecent.id,
		});
	},
);
