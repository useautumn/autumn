import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import {
	expectProductActive,
	expectProductCanceling,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts";

test.concurrent(`${chalk.yellowBright("uncancel addon: main active")}`, async () => {
	const customerId = "uncancel-addon-main-active";
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const creditsItem = items.monthlyCredits({ includedUsage: 50 });

	const pro = products.pro({ items: [messagesItem] });
	const addon = constructProduct({
		id: "addon",
		items: [creditsItem],
		type: "pro",
		isDefault: false,
		isAddOn: true,
	});

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, addon] }),
		],
		actions: [
			s.attach({ productId: pro.id }),
			s.attach({ productId: addon.id }),
			s.updateSubscription({
				productId: addon.id,
				cancelAction: "cancel_end_of_cycle",
			}),
		],
	});

	const customerAfterCancel =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductActive({
		customer: customerAfterCancel,
		productId: pro.id,
	});
	await expectProductCanceling({
		customer: customerAfterCancel,
		productId: addon.id,
	});

	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: addon.id,
		cancel_action: "uncancel",
	});

	const customerAfterUncancel =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductActive({
		customer: customerAfterUncancel,
		productId: addon.id,
	});
	await expectProductActive({
		customer: customerAfterUncancel,
		productId: pro.id,
	});

	expect(customerAfterUncancel.features?.[TestFeature.Messages]?.balance).toBe(
		100,
	);
	expect(customerAfterUncancel.features?.[TestFeature.Credits]?.balance).toBe(
		50,
	);

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		shouldBeCanceled: false,
	});
});

test.concurrent(`${chalk.yellowBright("uncancel main: addon canceling")}`, async () => {
	const customerId = "uncancel-main-addon-cancel";
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const creditsItem = items.monthlyCredits({ includedUsage: 50 });

	const pro = products.pro({ items: [messagesItem] });
	const addon = constructProduct({
		id: "addon",
		items: [creditsItem],
		type: "pro",
		isDefault: false,
		isAddOn: true,
	});

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, addon] }),
		],
		actions: [
			s.attach({ productId: pro.id }),
			s.attach({ productId: addon.id }),
			s.updateSubscription({
				productId: pro.id,
				cancelAction: "cancel_end_of_cycle",
			}),
			s.updateSubscription({
				productId: addon.id,
				cancelAction: "cancel_end_of_cycle",
			}),
		],
	});

	const customerAfterCancel =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductCanceling({
		customer: customerAfterCancel,
		productId: pro.id,
	});
	await expectProductCanceling({
		customer: customerAfterCancel,
		productId: addon.id,
	});

	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: pro.id,
		cancel_action: "uncancel",
	});

	const customerAfterUncancel =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductActive({
		customer: customerAfterUncancel,
		productId: pro.id,
	});
	await expectProductCanceling({
		customer: customerAfterUncancel,
		productId: addon.id,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

test.concurrent(`${chalk.yellowBright("uncancel both: main and addon")}`, async () => {
	const customerId = "uncancel-both";
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const creditsItem = items.monthlyCredits({ includedUsage: 50 });

	const pro = products.pro({ items: [messagesItem] });
	const addon = constructProduct({
		id: "addon",
		items: [creditsItem],
		type: "pro",
		isDefault: false,
		isAddOn: true,
	});

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, addon] }),
		],
		actions: [
			s.attach({ productId: pro.id }),
			s.attach({ productId: addon.id }),
			s.updateSubscription({
				productId: pro.id,
				cancelAction: "cancel_end_of_cycle",
			}),
			s.updateSubscription({
				productId: addon.id,
				cancelAction: "cancel_end_of_cycle",
			}),
		],
	});

	const customerAfterCancel =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductCanceling({
		customer: customerAfterCancel,
		productId: pro.id,
	});
	await expectProductCanceling({
		customer: customerAfterCancel,
		productId: addon.id,
	});

	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: pro.id,
		cancel_action: "uncancel",
	});
	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: addon.id,
		cancel_action: "uncancel",
	});

	const customerAfterUncancel =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductActive({
		customer: customerAfterUncancel,
		productId: pro.id,
	});
	await expectProductActive({
		customer: customerAfterUncancel,
		productId: addon.id,
	});

	expect(customerAfterUncancel.features?.[TestFeature.Messages]?.balance).toBe(
		100,
	);
	expect(customerAfterUncancel.features?.[TestFeature.Credits]?.balance).toBe(
		50,
	);

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		shouldBeCanceled: false,
	});
});

test.concurrent(`${chalk.yellowBright("uncancel: separate subscriptions")}`, async () => {
	const customerId = "uncancel-separate-subs";
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const creditsItem = items.monthlyCredits({ includedUsage: 50 });

	const pro = products.pro({ items: [messagesItem] });

	const addon = constructProduct({
		id: "addon",
		items: [creditsItem],
		type: "pro",
		isDefault: false,
		isAddOn: true,
	});

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, addon] }),
		],
		actions: [
			s.attach({ productId: pro.id }),
			s.attach({ productId: addon.id }),
		],
	});

	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: addon.id,
		cancel_action: "cancel_end_of_cycle",
	});

	const customerAfterCancel =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductActive({
		customer: customerAfterCancel,
		productId: pro.id,
	});
	await expectProductCanceling({
		customer: customerAfterCancel,
		productId: addon.id,
	});

	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: addon.id,
		cancel_action: "uncancel",
	});

	const customerAfterUncancel =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductActive({
		customer: customerAfterUncancel,
		productId: pro.id,
	});
	await expectProductActive({
		customer: customerAfterUncancel,
		productId: addon.id,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		shouldBeCanceled: false,
	});
});
