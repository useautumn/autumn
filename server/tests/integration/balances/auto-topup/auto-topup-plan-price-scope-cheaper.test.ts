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

test(`${chalk.yellowBright("topup-price-scope: control on the CHEAPER plan charges that plan's price, not the pricier plan's")}`, async () => {
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
});
