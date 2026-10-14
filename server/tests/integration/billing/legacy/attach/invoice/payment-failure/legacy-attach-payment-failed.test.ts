import { expect, test } from "bun:test";
import { type ApiCustomerV3, OnIncrease, SuccessCode } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { completeInvoiceCheckoutV2 as completeInvoiceCheckout } from "@tests/utils/browserPool/completeInvoiceCheckoutV2";
import {
	expectProductAttached,
	expectProductNotAttached,
} from "@tests/utils/expectUtils/expectProductAttached";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test.concurrent(
	`${chalk.yellowBright("legacy-fail 1: new subscription")}`,
	async () => {
		const customerId = "legacy-fail-new";

		const messagesItem = items.monthlyMessages({ includedUsage: 100 });
		const pro = products.pro({
			id: "pro",
			items: [messagesItem],
		});

		const { autumnV1 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "fail" }),
				s.products({ list: [pro] }),
			],
			actions: [],
		});

		const res = await autumnV1.attach({
			customer_id: customerId,
			product_id: pro.id,
		});

		expect(res.checkout_url).toBeDefined();

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		expect(customer.features?.[TestFeature.Messages]).toBeUndefined();

		await completeInvoiceCheckout({
			url: res.checkout_url,
			ctx,
			customerId,
		});

		await expectCustomerProducts({
			autumn: autumnV1,
			customerId,
			active: [pro.id],
		});

		await expectSubToBeCorrect({
			db: ctx.db,
			customerId,
			org: ctx.org,
			env: ctx.env,
		});
	},
);

test.concurrent(`${chalk.yellowBright("legacy-fail 2: upgrade")}`, async () => {
	const customerId = "legacy-fail-upgrade";

	const proMessagesItem = items.monthlyMessages({ includedUsage: 100 });
	const pro = products.pro({
		id: "pro",
		items: [proMessagesItem],
	});

	const premiumMessagesItem = items.monthlyMessages({
		includedUsage: 500,
	});
	const premium = products.premium({
		id: "premium",
		items: [premiumMessagesItem],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
		],
		actions: [
			s.attach({ productId: pro.id }),
			s.attachPaymentMethod({ type: "fail" }),
		],
	});

	const res = await autumnV1.attach({
		customer_id: customerId,
		product_id: premium.id,
	});

	expect(res.checkout_url).toBeDefined();

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectProductAttached({ customer: customer as any, product: pro });

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 100,
		balance: 100,
		usage: 0,
	});
});

test.concurrent(
	`${chalk.yellowBright("legacy-fail 3: merged add-on")}`,
	async () => {
		const customerId = "legacy-fail-merged";

		const messagesItem = items.monthlyMessages({ includedUsage: 100 });
		const pro = products.pro({
			id: "pro",
			items: [messagesItem],
		});

		const addOnMessagesItem = items.monthlyMessages({ includedUsage: 200 });
		const addOnPriceItem = items.monthlyPrice({ price: 10 });
		const addOn = products.base({
			id: "monthly-addon",
			isAddOn: true,
			items: [addOnMessagesItem, addOnPriceItem],
		});

		const { autumnV1 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, addOn] }),
			],
			actions: [
				s.attach({ productId: pro.id }),
				s.attachPaymentMethod({ type: "fail" }),
			],
		});

		const res = await autumnV1.attach({
			customer_id: customerId,
			product_id: addOn.id,
		});

		expect(res.checkout_url).toBeDefined();

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		expectProductAttached({ customer: customer as any, product: pro });
		expectProductNotAttached({ customer: customer as any, product: addOn });
	},
);

test.concurrent(
	`${chalk.yellowBright("legacy-fail 4: update quantity")}`,
	async () => {
		const customerId = "legacy-fail-qty";

		const prepaidItem = items.prepaidMessages({
			includedUsage: 100,
			billingUnits: 100,
			price: 10,
			config: {
				on_increase: OnIncrease.ProrateImmediately,
			},
		});
		const pro = products.pro({
			id: "pro",
			items: [prepaidItem],
		});

		const initialQuantityV1 = 300;
		const initialTotalBalance = 100 + initialQuantityV1;

		const { autumnV1 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [
				s.attach({
					productId: pro.id,
					options: [
						{
							feature_id: TestFeature.Messages,
							quantity: initialQuantityV1,
						},
					],
				}),
				s.attachPaymentMethod({ type: "fail" }),
			],
		});

		const customerInit =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		expectCustomerFeatureCorrect({
			customer: customerInit,
			featureId: TestFeature.Messages,
			includedUsage: initialTotalBalance,
			balance: initialTotalBalance,
			usage: 0,
		});

		const res = await autumnV1.attach({
			customer_id: customerId,
			product_id: pro.id,
			options: [{ feature_id: TestFeature.Messages, quantity: 500 }],
		});

		expect(res.checkout_url).toBeDefined();

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		expectCustomerFeatureCorrect({
			customer,
			featureId: TestFeature.Messages,
			includedUsage: initialTotalBalance,
			balance: initialTotalBalance,
			usage: 0,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("legacy-fail 5: new subscription, recover via invoice checkout")}`,
	async () => {
		const customerId = "legacy-fail-recover-new";

		const messagesItem = items.monthlyMessages({ includedUsage: 100 });
		const pro = products.pro({
			id: "pro",
			items: [messagesItem],
		});

		const { autumnV1 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "fail" }),
				s.products({ list: [pro] }),
			],
			actions: [],
		});

		const res = await autumnV1.attach({
			customer_id: customerId,
			product_id: pro.id,
		});

		expect(res.code).toBe(SuccessCode.InvoiceActionRequired);
		expect(res.checkout_url).toBeDefined();
		expect(res.checkout_url).toContain("invoice.stripe.com");
		expect(res.message).toBe("Payment action required");

		await completeInvoiceCheckout({
			url: res.checkout_url,
			ctx,
			customerId,
		});

		await expectCustomerProducts({
			autumn: autumnV1,
			customerId,
			active: [pro.id],
		});

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		expectCustomerFeatureCorrect({
			customer,
			featureId: TestFeature.Messages,
			includedUsage: 100,
			balance: 100,
			usage: 0,
		});

		await expectSubToBeCorrect({
			db: ctx.db,
			customerId,
			org: ctx.org,
			env: ctx.env,
		});
	},
	120000,
);

test.concurrent(
	`${chalk.yellowBright("legacy-fail 6: one-off product, recover via invoice checkout")}`,
	async () => {
		const customerId = "legacy-fail-recover-oneoff";

		const messagesItem = items.monthlyMessages({ includedUsage: 100 });
		const oneOff = products.oneOff({
			id: "one-off",
			items: [messagesItem],
		});

		const { autumnV1 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "fail" }),
				s.products({ list: [oneOff] }),
			],
			actions: [],
		});

		const res = await autumnV1.attach({
			customer_id: customerId,
			product_id: oneOff.id,
		});

		expect(res.checkout_url).toBeDefined();

		const customerBefore =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		expect(customerBefore.features?.[TestFeature.Messages]).toBeUndefined();

		await completeInvoiceCheckout({
			url: res.checkout_url,
			ctx,
			customerId,
		});

		await expectCustomerProducts({
			autumn: autumnV1,
			customerId,
			active: [oneOff.id],
		});

		const customerAfter =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		expectCustomerFeatureCorrect({
			customer: customerAfter,
			featureId: TestFeature.Messages,
			includedUsage: 100,
			balance: 100,
			usage: 0,
		});
	},
);
