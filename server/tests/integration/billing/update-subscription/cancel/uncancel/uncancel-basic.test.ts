import { expect, test } from "bun:test";
import { type ApiCustomerV3, ErrCode } from "@autumn/shared";
import {
	expectProductActive,
	expectProductCanceling,
	expectProductNotPresent,
	expectProductScheduled,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { advanceToNextInvoice } from "@tests/utils/testAttachUtils/testAttachUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts";

test.concurrent(`${chalk.yellowBright("uncancel: with scheduled default product")}`, async () => {
	const customerId = "uncancel-with-default";
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const freeMessagesItem = items.monthlyMessages({ includedUsage: 10 });

	const pro = products.pro({ items: [messagesItem] });
	const free = constructProduct({
		id: "free",
		items: [freeMessagesItem],
		type: "free",
		isDefault: true,
	});

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, free] }),
		],
		actions: [
			s.attach({ productId: pro.id }),
			s.updateSubscription({
				productId: pro.id,
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
	await expectProductScheduled({
		customer: customerAfterCancel,
		productId: free.id,
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

	await expectProductNotPresent({
		customer: customerAfterUncancel,
		productId: free.id,
	});

	expect(customerAfterUncancel.features?.[TestFeature.Messages]?.balance).toBe(
		100,
	);

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		shouldBeCanceled: false,
	});
});

test.concurrent(`${chalk.yellowBright("uncancel: already active (no-op)")}`, async () => {
	const customerId = "uncancel-noop";
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const pro = products.pro({ items: [messagesItem] });

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.attach({ productId: pro.id })],
	});

	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductActive({
		customer: customerBefore,
		productId: pro.id,
	});

	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: pro.id,
		cancel_action: "uncancel",
	});

	const customerAfter = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductActive({
		customer: customerAfter,
		productId: pro.id,
	});

	expect(customerAfter.features?.[TestFeature.Messages]?.balance).toBe(100);

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		shouldBeCanceled: false,
	});
});

test.concurrent(`${chalk.yellowBright("uncancel: preserves usage")}`, async () => {
	const customerId = "uncancel-usage";
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const pro = products.pro({ items: [messagesItem] });

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.attach({ productId: pro.id, timeout: 4000 })],
	});

	const messagesUsage = 40;
	await autumnV1.track(
		{
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: messagesUsage,
		},
		{ timeout: 4000 },
	);

	const customerWithUsage =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expect(customerWithUsage.features?.[TestFeature.Messages]?.usage).toBe(
		messagesUsage,
	);

	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: pro.id,
		cancel_action: "cancel_end_of_cycle",
	});

	await new Promise((resolve) => setTimeout(resolve, 4000));

	const customerAfterCancel =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductCanceling({
		customer: customerAfterCancel,
		productId: pro.id,
	});

	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: pro.id,
		cancel_action: "uncancel",
	});

	await new Promise((resolve) => setTimeout(resolve, 4000));

	const customerAfterUncancel =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductActive({
		customer: customerAfterUncancel,
		productId: pro.id,
	});

	expect(customerAfterUncancel.features?.[TestFeature.Messages]?.usage).toBe(
		messagesUsage,
	);
	expect(customerAfterUncancel.features?.[TestFeature.Messages]?.balance).toBe(
		100 - messagesUsage,
	);

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		shouldBeCanceled: false,
	});
});

test.concurrent(`${chalk.yellowBright("error: uncancel scheduled product")}`, async () => {
	const customerId = "uncancel-err-scheduled";
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const premiumMessagesItem = items.monthlyMessages({ includedUsage: 500 });

	const pro = products.pro({ items: [messagesItem] });
	const premium = constructProduct({
		id: "premium",
		items: [premiumMessagesItem],
		type: "premium",
		isDefault: false,
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [premium, pro] }),
		],
		actions: [s.attach({ productId: premium.id })],
	});

	await autumnV1.attach({
		customer_id: customerId,
		product_id: pro.id,
	});

	const customerAfterDowngrade =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductScheduled({
		customer: customerAfterDowngrade,
		productId: pro.id,
	});

	await expectAutumnError({
		errCode: ErrCode.InvalidRequest,
		func: async () => {
			await autumnV1.subscriptions.update({
				customer_id: customerId,
				product_id: pro.id,
				cancel_action: "uncancel",
			});
		},
	});
});

test.concurrent(`${chalk.yellowBright("error: uncancel expired product")}`, async () => {
	const customerId = "uncancel-err-expired";
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const freeMessagesItem = items.monthlyMessages({ includedUsage: 10 });

	const pro = products.pro({ items: [messagesItem] });
	const free = constructProduct({
		id: "free",
		items: [freeMessagesItem],
		type: "free",
		isDefault: true,
	});

	const { autumnV1, ctx, testClockId } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, free] }),
		],
		actions: [
			s.attach({ productId: pro.id }),
			s.updateSubscription({
				productId: pro.id,
				cancelAction: "cancel_end_of_cycle",
			}),
		],
	});

	await advanceToNextInvoice({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
	});

	const customerAfterAdvance =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductNotPresent({
		customer: customerAfterAdvance,
		productId: pro.id,
	});
	await expectProductActive({
		customer: customerAfterAdvance,
		productId: free.id,
	});

	await expectAutumnError({
		func: async () => {
			await autumnV1.subscriptions.update({
				customer_id: customerId,
				product_id: pro.id,
				cancel_action: "uncancel",
			});
		},
	});
});
