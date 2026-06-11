/**
 * Regression test for v2 billing.attach one-off purchases in a non-USD org:
 * createInvoiceForBilling did not pass `currency` to stripeCli.invoices.create,
 * so Stripe defaulted the invoice to the account currency (usd) and rejected
 * the org-currency (rwf) price with "price only supports rwf, expected usd".
 *
 * Pre-fix: attach fails with a Stripe currency-mismatch error.
 * Post-fix: invoice created in RWF with total 23,198 (23,188 prepaid + 10 base).
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

test(`${chalk.yellowBright("v2 one-off rwf: billing.attach invoices in the org currency")}`, async () => {
	const customerId = "v2-oneoff-rwf-zero-decimal";

	// Sub-org first so the currency is RWF before any Stripe prices exist.
	const { ctx } = await initScenario({
		setup: [s.platform.create({ setupDefaultFeatures: true })],
		actions: [],
	});

	await setOrgCurrency({ orgId: ctx.org.id, currency: "rwf" });
	ctx.org.default_currency = "rwf";

	const oneOff = products.oneOff({
		id: "v2-one-off-rwf",
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

	await autumnV1.billing.attach({
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
