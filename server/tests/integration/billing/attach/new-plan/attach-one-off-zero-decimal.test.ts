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

	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: 23_198,
		latestStatus: "paid",
	});
});
