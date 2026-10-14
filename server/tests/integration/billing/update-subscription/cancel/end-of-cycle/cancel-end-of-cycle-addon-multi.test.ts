import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import {
	expectProductActive,
	expectProductCanceling,
	expectProductNotPresent,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { getSubscriptionId } from "@tests/integration/billing/utils/stripe/getSubscriptionId";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { advanceToNextInvoice } from "@tests/utils/testAttachUtils/testAttachUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { isStripeSubscriptionCanceling } from "@/external/stripe/subscriptions/utils/classifyStripeSubscriptionUtils";

test.concurrent(
	`${chalk.yellowBright("cancel addon EOC: separate subscription (new_billing_subscription), correct sub canceled")}`,
	async () => {
		const customerId = "cancel-addon-eoc-separate-sub";

		const messagesItem = items.monthlyMessages({ includedUsage: 100 });

		const pro = products.pro({
			id: "pro",
			items: [messagesItem],
		});

		const addon = products.recurringAddOn({
			id: "addon",
			items: [items.monthlyMessages({ includedUsage: 300 })],
		});

		const { autumnV1, ctx, testClockId } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, addon] }),
			],
			actions: [
				s.attach({ productId: pro.id }),
				s.attach({ productId: addon.id, newBillingSubscription: true }),
			],
		});

		const proSubId = await getSubscriptionId({
			ctx,
			customerId,
			productId: pro.id,
		});

		const addonSubId = await getSubscriptionId({
			ctx,
			customerId,
			productId: addon.id,
		});

		expect(proSubId).not.toBe(addonSubId);

		const proSubBefore = await ctx.stripeCli.subscriptions.retrieve(proSubId);
		const addonSubBefore =
			await ctx.stripeCli.subscriptions.retrieve(addonSubId);

		expect(isStripeSubscriptionCanceling(proSubBefore)).toBe(false);
		expect(isStripeSubscriptionCanceling(addonSubBefore)).toBe(false);

		await autumnV1.subscriptions.update({
			customer_id: customerId,
			product_id: addon.id,
			cancel_action: "cancel_end_of_cycle",
		});

		const proSubAfterCancel =
			await ctx.stripeCli.subscriptions.retrieve(proSubId);
		const addonSubAfterCancel =
			await ctx.stripeCli.subscriptions.retrieve(addonSubId);

		expect(isStripeSubscriptionCanceling(proSubAfterCancel)).toBe(false);

		expect(isStripeSubscriptionCanceling(addonSubAfterCancel)).toBe(true);

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

		await advanceToNextInvoice({
			stripeCli: ctx.stripeCli,
			testClockId: testClockId!,
		});

		const customerAfterAdvance =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);

		await expectProductActive({
			customer: customerAfterAdvance,
			productId: pro.id,
		});

		await expectProductNotPresent({
			customer: customerAfterAdvance,
			productId: addon.id,
		});

		const proSubAfterAdvance =
			await ctx.stripeCli.subscriptions.retrieve(proSubId);
		expect(proSubAfterAdvance.status).toBe("active");
		expect(isStripeSubscriptionCanceling(proSubAfterAdvance)).toBe(false);

		await expectSubToBeCorrect({
			db: ctx.db,
			customerId,
			org: ctx.org,
			env: ctx.env,
			subCount: 1,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("cancel addon EOC: multiple addons, cancel one, other persists")}`,
	async () => {
		const customerId = "cancel-addon-eoc-multiple";

		const messagesItem = items.monthlyMessages({ includedUsage: 100 });

		const pro = products.pro({
			id: "pro",
			items: [messagesItem],
		});

		const addon1 = products.recurringAddOn({
			id: "addon1",
			items: [items.monthlyMessages({ includedUsage: 200 })],
		});

		const addon2 = products.recurringAddOn({
			id: "addon2",
			items: [items.monthlyMessages({ includedUsage: 300 })],
		});

		const { autumnV1, ctx, testClockId } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, addon1, addon2] }),
			],
			actions: [
				s.attach({ productId: pro.id }),
				s.attach({ productId: addon1.id }),
				s.attach({ productId: addon2.id }),
			],
		});

		const customerAfterAttach =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);

		await expectProductActive({
			customer: customerAfterAttach,
			productId: pro.id,
		});
		await expectProductActive({
			customer: customerAfterAttach,
			productId: addon1.id,
		});
		await expectProductActive({
			customer: customerAfterAttach,
			productId: addon2.id,
		});

		expectCustomerInvoiceCorrect({
			customer: customerAfterAttach,
			count: 3,
			latestTotal: 20,
		});

		await autumnV1.subscriptions.update({
			customer_id: customerId,
			product_id: addon1.id,
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
			productId: addon1.id,
		});
		await expectProductActive({
			customer: customerAfterCancel,
			productId: addon2.id,
		});

		await advanceToNextInvoice({
			stripeCli: ctx.stripeCli,
			testClockId: testClockId!,
		});

		const customerAfterAdvance =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);

		await expectProductActive({
			customer: customerAfterAdvance,
			productId: pro.id,
		});
		await expectProductNotPresent({
			customer: customerAfterAdvance,
			productId: addon1.id,
		});
		await expectProductActive({
			customer: customerAfterAdvance,
			productId: addon2.id,
		});
	},
);
