/**
 * Auto-topup price scoping across plans: a PLAN-level config charges the control
 * plan's price; a CUSTOMER-level config charges the most recently attached plan's.
 */

import { test } from "bun:test";
import type { ApiCustomerV5 } from "@autumn/shared";
import { makeAutoTopupConfig } from "@tests/integration/balances/auto-topup/utils/makeAutoTopupConfig";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { TestFeature } from "@tests/setup/v2Features.js";
import { products } from "@tests/utils/fixtures/products.js";
import { timeout } from "@tests/utils/genUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { Decimal } from "decimal.js";
import {
	AUTO_TOPUP_WAIT_MS,
	BURST_SUPPRESSION_TTL_MS,
	oneOffItem,
} from "./utils/autoTopupPlanPriceScope.js";

test(`${chalk.yellowBright("topup-price-scope: control on the PRICIER plan charges that plan's price, not the cheaper plan's")}`, async () => {
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
});
