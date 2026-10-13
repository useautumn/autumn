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

test(`${chalk.yellowBright("topup-price-scope: a CUSTOMER-level config charges the most recently attached plan's price")}`, async () => {
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
});
