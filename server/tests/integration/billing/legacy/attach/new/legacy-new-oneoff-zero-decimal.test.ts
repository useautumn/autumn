import { test } from "bun:test";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect.js";
import { waitForCustomerInvoiceStatus } from "@tests/integration/billing/utils/waitForCustomerInvoiceStatus.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import { setOrgCurrency } from "@tests/utils/testInitUtils/setOrgCurrency.js";
import chalk from "chalk";

test(`${chalk.yellowBright("legacy one-off rwf: prepaid one-off charges major units, not x100")}`, async () => {
	const customerId = "legacy-oneoff-rwf-zero-decimal";

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

	const customer = await waitForCustomerInvoiceStatus({
		autumn: autumnV1,
		customerId,
		status: "paid",
		timeoutMs: 120_000,
	});

	try {
		await expectCustomerInvoiceCorrect({
			customer,
			count: 1,
			latestTotal: 23_198,
			latestStatus: "paid",
		});
	} catch (error) {
		const invoices = await ctx.stripeCli.invoices.list({ limit: 5 });
		const detail = invoices.data
			.map(
				(invoice) =>
					`${invoice.id}:${invoice.status}:${invoice.currency}:${invoice.total}` +
					`:${invoice.last_finalization_error?.message ?? "no-finalization-error"}`,
			)
			.join(" | ");
		throw new Error(`${error} — stripe invoices: [${detail}]`);
	}
});
