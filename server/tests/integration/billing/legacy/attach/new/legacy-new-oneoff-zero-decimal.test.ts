/**
 * Regression test for zero-decimal currency (RWF) one-off purchases charging
 * 100x: handleOneOffFunction built inline price_data with a raw `* 100`
 * instead of atmnToStripeAmount, so RWF 23,188 was charged as RWF 2,318,800.
 *
 * Pre-fix: invoice total 2,318,810 RWF (prepaid item 100x'd; fixed base OK).
 * Post-fix: invoice total 23,198 RWF (23,188 prepaid + 10 base).
 *
 * Uses a dedicated sub-org because default_currency is org-wide state and
 * group runs execute test files in parallel against the shared master org.
 */

import { test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import { setOrgCurrency } from "@tests/utils/testInitUtils/setOrgCurrency.js";
import chalk from "chalk";

test(`${chalk.yellowBright("legacy one-off rwf: prepaid one-off charges major units, not x100")}`, async () => {
	const customerId = "legacy-oneoff-rwf-zero-decimal";

	// Sub-org first so the currency is RWF before any Stripe prices exist.
	const { ctx } = await initScenario({
		setup: [s.platform.create({ setupDefaultFeatures: true })],
		actions: [],
	});

	await setOrgCurrency({ orgId: ctx.org.id, currency: "rwf" });
	ctx.org.default_currency = "rwf";

	const oneOff = products.oneOff({
		id: "one-off-rwf",
		items: [
			items.oneOffMessages({
				includedUsage: 0,
				billingUnits: 1,
				price: 23_188,
			}),
		],
	});

	const { autumnV1 } = await initScenario({
		ctx,
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [oneOff] }),
		],
		actions: [],
	});

	await autumnV1.attach({
		customer_id: customerId,
		product_id: oneOff.id,
		options: [{ feature_id: TestFeature.Messages, quantity: 1 }],
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// 23,188 RWF prepaid item + 10 RWF product base price
	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: 23_198,
		latestStatus: "paid",
	});
}, 120_000);
