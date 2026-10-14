import { expect, test } from "bun:test";
import { type ApiCustomerV3, OnDecrease, OnIncrease } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectProductActive } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectProductItemQuantity } from "@tests/integration/billing/utils/expectProductItemCorrect";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { advanceToNextInvoice } from "@tests/utils/testAttachUtils/testAttachUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { addMonths } from "date-fns";

test.concurrent(`${chalk.yellowBright("invoice.created prepaid: quantity downgrade - balance resets on cycle")}`, async () => {
	const customerId = "inv-created-prepaid-qty-downgrade";

	const prepaidItem = items.prepaidMessages({
		billingUnits: 100,
		price: 12.5,
		config: {
			on_increase: OnIncrease.ProrateImmediately,
			on_decrease: OnDecrease.None,
		},
	});

	const pro = products.pro({
		id: "pro",
		items: [prepaidItem],
	});

	const { autumnV1, ctx, testClockId } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [
			s.attach({
				productId: pro.id,
				options: [{ feature_id: TestFeature.Messages, quantity: 300 }],
			}),
			s.attach({
				productId: pro.id,
				options: [{ feature_id: TestFeature.Messages, quantity: 200 }],
			}),
		],
	});

	await advanceToNextInvoice({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
	});

	const customerFinal = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	expect(customerFinal.features[TestFeature.Messages].balance).toBe(200);

	await expectProductItemQuantity({
		customer: customerFinal,
		productId: pro.id,
		featureId: TestFeature.Messages,
		quantity: 200,
	});

	expectCustomerInvoiceCorrect({
		customer: customerFinal,
		count: 2,
		latestTotal: 25 + 20,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		subCount: 1,
	});
});

test.concurrent(`${chalk.yellowBright("invoice.created prepaid: quantity upgrade prorate-next-cycle")}`, async () => {
	const customerId = "inv-created-prepaid-prorate-next";

	const prepaidItem = items.prepaidMessages({
		billingUnits: 100,
		price: 12.5,
		config: {
			on_increase: OnIncrease.ProrateNextCycle,
			on_decrease: OnDecrease.None,
		},
	});

	const pro = products.pro({
		id: "pro",
		items: [prepaidItem],
	});

	const usage = Math.floor(Math.random() * 220);

	const { autumnV1, ctx, testClockId } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [
			s.attach({
				productId: pro.id,
				options: [{ feature_id: TestFeature.Messages, quantity: 300 }],
			}),
			s.track({ featureId: TestFeature.Messages, value: usage }),
			s.attach({
				productId: pro.id,
				options: [{ feature_id: TestFeature.Messages, quantity: 400 }],
			}),
		],
	});

	const customerAfterUpgrade =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectCustomerInvoiceCorrect({
		customer: customerAfterUpgrade,
		count: 1,
	});

	await advanceToNextInvoice({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
	});

	const customerFinal = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	expect(customerFinal.features[TestFeature.Messages].balance).toBe(400);

	expectCustomerInvoiceCorrect({
		customer: customerFinal,
		count: 2,
		latestTotal: 82.5,
	});
});

test.concurrent(`${chalk.yellowBright("invoice.created prepaid: basic reset after usage")}`, async () => {
	const customerId = "inv-created-prepaid-basic-reset";

	const prepaidItem = items.prepaidMessages({
		billingUnits: 100,
		price: 12.5,
		config: {
			on_increase: OnIncrease.ProrateImmediately,
			on_decrease: OnDecrease.None,
		},
	});

	const pro = products.pro({
		id: "pro",
		items: [prepaidItem],
	});

	const initialQuantity = 300;
	const usage = 100;

	const { autumnV1, ctx, testClockId } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [
			s.attach({
				productId: pro.id,
				options: [
					{ feature_id: TestFeature.Messages, quantity: initialQuantity },
				],
			}),
			s.track({ featureId: TestFeature.Messages, value: usage }),
		],
	});

	await new Promise((resolve) => setTimeout(resolve, 3000));

	const customerAfterUsage =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expect(customerAfterUsage.features[TestFeature.Messages].balance).toBe(
		initialQuantity - usage,
	);

	await advanceToNextInvoice({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
	});

	const customerFinal = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expect(customerFinal.features[TestFeature.Messages].balance).toBe(
		initialQuantity,
	);

	await expectProductActive({
		customer: customerFinal,
		productId: pro.id,
	});

	expectCustomerFeatureCorrect({
		customer: customerFinal,
		featureId: TestFeature.Messages,
		balance: initialQuantity,
		resetsAt: addMonths(Date.now(), 2).getTime(),
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		subCount: 1,
	});
});

test.concurrent(`${chalk.yellowBright("invoice.created prepaid: continuous-use seats downgrade")}`, async () => {
	const customerId = "inv-created-prepaid-seats-downgrade";

	const prepaidUsers = items.prepaid({
		featureId: TestFeature.Users,
		billingUnits: 1,
		includedUsage: 0,
		config: {
			on_increase: OnIncrease.ProrateImmediately,
			on_decrease: OnDecrease.None,
		},
	});

	const pro = products.pro({
		id: "pro",
		items: [prepaidUsers],
	});

	const initialQuantity = 4;
	const usage = 3;
	const newQuantity = 3;

	const { autumnV1, ctx, testClockId } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [
			s.attach({
				productId: pro.id,
				options: [{ feature_id: TestFeature.Users, quantity: initialQuantity }],
			}),
			s.track({ featureId: TestFeature.Users, value: usage }),
			s.attach({
				productId: pro.id,
				options: [{ feature_id: TestFeature.Users, quantity: newQuantity }],
				timeout: 3000,
			}),
		],
	});

	await advanceToNextInvoice({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
	});

	const customerFinal = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	expect(customerFinal.features[TestFeature.Users].balance).toBe(0);

	await expectProductItemQuantity({
		customer: customerFinal,
		productId: pro.id,
		featureId: TestFeature.Users,
		quantity: newQuantity,
	});

	expectCustomerInvoiceCorrect({
		customer: customerFinal,
		count: 2,
		latestTotal: newQuantity * 10 + 20,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		subCount: 1,
	});
});
