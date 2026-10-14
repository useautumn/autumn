/** biome-ignore-all lint/suspicious/noExplicitAny: test file */

import { expect, test } from "bun:test";
import { type ApiCustomerV3, LegacyVersion } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { expectProductAttached } from "@tests/utils/expectUtils/expectProductAttached";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli";
import { attachFailedPaymentMethod } from "@/external/stripe/stripeCusUtils";
import { CusService } from "@/internal/customers/CusService";

test.concurrent(`${chalk.yellowBright("legacy-oneoff 1: attach and accumulate balance")}`, async () => {
	const customerId = "legacy-oneoff-1";

	const oneOffMessagesItem = items.oneOffMessages({
		billingUnits: 250,
		price: 8,
	});

	const oneOff = products.base({
		id: "one-off",
		items: [oneOffMessagesItem],
	});

	const autumnV1 = new AutumnInt({ version: LegacyVersion.v1_4 });

	await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: true, paymentMethod: "success" }),
			s.products({ list: [oneOff] }),
		],
		actions: [],
	});

	const options1 = [{ feature_id: TestFeature.Messages, quantity: 500 }];

	await autumnV1.attach({
		customer_id: customerId,
		product_id: oneOff.id,
		options: options1,
	});

	const customerAfter1 =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	expectProductAttached({
		customer: customerAfter1 as any,
		product: oneOff,
		quantity: 1,
	});

	expectCustomerFeatureCorrect({
		customer: customerAfter1,
		featureId: TestFeature.Messages,
		balance: 500,
		usage: 0,
	});

	const options2 = [{ feature_id: TestFeature.Messages, quantity: 750 }];

	await autumnV1.attach({
		customer_id: customerId,
		product_id: oneOff.id,
		options: options2,
	});

	await expectCustomerInvoiceCorrect({
		customer: customerAfter1,
		count: 1,
		latestTotal: 16,
	});

	const customerAfter2 =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	const totalBalance = options1[0].quantity + options2[0].quantity;

	expectCustomerFeatureCorrect({
		customer: customerAfter2,
		featureId: TestFeature.Messages,
		balance: totalBalance,
	});

	expectProductAttached({
		customer: customerAfter2 as any,
		product: oneOff,
		quantity: 2,
	});

	await expectCustomerInvoiceCorrect({
		customer: customerAfter2,
		count: 2,
		latestTotal: 24,
	});
});

test.concurrent(`${chalk.yellowBright("legacy-oneoff 2: payment failure returns checkout_url")}`, async () => {
	const customerId = "legacy-oneoff-2";

	const oneOffMessagesItem = items.oneOffMessages({
		billingUnits: 250,
		price: 8,
	});

	const oneOff = products.oneOff({
		id: "one-off",
		items: [oneOffMessagesItem],
	});

	const autumnV1 = new AutumnInt({ version: LegacyVersion.v1_4 });

	await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: true, paymentMethod: "success" }),
			s.products({ list: [oneOff] }),
		],
		actions: [],
	});

	const customer = await CusService.get({
		db: ctx.db,
		idOrInternalId: customerId,
		orgId: ctx.org.id,
		env: ctx.env,
	});

	await attachFailedPaymentMethod({
		stripeCli: ctx.stripeCli,
		customer: customer!,
	});

	const options = [{ feature_id: TestFeature.Messages, quantity: 500 }];

	const res = await autumnV1.attach({
		customer_id: customerId,
		product_id: oneOff.id,
		options,
	});

	expect(res.checkout_url).toBeDefined();
});
