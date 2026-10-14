import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { driveProductPastDue } from "@tests/integration/billing/utils/driveProductPastDue";
import {
	expectCustomerProducts,
	expectProductActive,
	expectProductCanceling,
	expectProductPastDue,
	expectProductScheduled,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectNoStripeSubscription } from "@tests/integration/billing/utils/expectNoStripeSubscription";
import { getSubscriptionId } from "@tests/integration/billing/utils/stripe/getSubscriptionId";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import type { Stripe } from "stripe";
import { CusService } from "@/internal/customers/CusService";
import { OrgService } from "@/internal/orgs/OrgService";
import { timeout } from "@/utils/genUtils";

test(`${chalk.yellowBright("cancel eoc past_due: flag on -> cancels immediately and voids open invoice")}`, async () => {
	const customerId = "cancel-pastdue-void-immediate";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const free = products.base({
		id: "free",
		items: [messagesItem],
		isDefault: true,
	});
	const pro = products.pro({ id: "pro", items: [messagesItem] });

	const { autumnV1, ctx, testClockId } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: true, paymentMethod: "success" }),
			s.products({ list: [free, pro], customerIdsToDelete: [customerId] }),
		],
		actions: [s.attach({ productId: pro.id })],
	});

	const originalOrgConfig = ctx.org.config;
	await OrgService.update({
		db: ctx.db,
		orgId: ctx.org.id,
		updates: {
			config: {
				...ctx.org.config,
				void_invoices_on_subscription_deletion: true,
			},
		},
	});

	try {
		const { subscriptionId, stripeCustomerId } = await driveProductPastDue({
			ctx,
			testClockId: testClockId!,
			customerId,
			productId: pro.id,
		});

		const customerBeforeCancel =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectProductPastDue({
			customer: customerBeforeCancel,
			productId: pro.id,
		});

		const invoicesBeforeCancel = await ctx.stripeCli.invoices.list({
			customer: stripeCustomerId,
			subscription: subscriptionId,
		});
		expect(
			invoicesBeforeCancel.data.filter((inv) => inv.status === "open").length,
		).toBeGreaterThan(0);

		await autumnV1.subscriptions.update({
			customer_id: customerId,
			product_id: pro.id,
			cancel_action: "cancel_end_of_cycle",
		});

		await timeout(3000);

		const customerAfterCancel =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectCustomerProducts({
			customer: customerAfterCancel,
			notPresent: [pro.id],
			active: [free.id],
		});

		await expectNoStripeSubscription({
			db: ctx.db,
			customerId,
			org: ctx.org,
			env: ctx.env,
		});

		const invoicesAfterCancel = await ctx.stripeCli.invoices.list({
			customer: stripeCustomerId,
			subscription: subscriptionId,
		});
		expect(
			invoicesAfterCancel.data.filter((inv) => inv.status === "open").length,
		).toBe(0);
		expect(
			invoicesAfterCancel.data.filter((inv) => inv.status === "void").length,
		).toBeGreaterThan(0);

		const allInvoices = await ctx.stripeCli.invoices.list({
			customer: stripeCustomerId,
		});
		expect(allInvoices.data.filter((inv) => (inv.total ?? 0) < 0).length).toBe(
			0,
		);
		const stripeCustomer = (await ctx.stripeCli.customers.retrieve(
			stripeCustomerId!,
		)) as Stripe.Customer;
		expect(stripeCustomer.balance).toBe(0);
	} finally {
		await OrgService.update({
			db: ctx.db,
			orgId: ctx.org.id,
			updates: { config: originalOrgConfig },
		});
	}
});

test(`${chalk.yellowBright("cancel eoc past_due: flag off -> stays scheduled, invoice not voided")}`, async () => {
	const customerId = "cancel-pastdue-void-flag-off";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const free = products.base({
		id: "free",
		items: [messagesItem],
		isDefault: true,
	});
	const pro = products.pro({ id: "pro", items: [messagesItem] });

	const { autumnV1, ctx, testClockId } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: true, paymentMethod: "success" }),
			s.products({ list: [free, pro], customerIdsToDelete: [customerId] }),
		],
		actions: [s.attach({ productId: pro.id })],
	});

	const originalOrgConfig = ctx.org.config;
	await OrgService.update({
		db: ctx.db,
		orgId: ctx.org.id,
		updates: {
			config: {
				...ctx.org.config,
				void_invoices_on_subscription_deletion: false,
			},
		},
	});

	try {
		const { subscriptionId, stripeCustomerId } = await driveProductPastDue({
			ctx,
			testClockId: testClockId!,
			customerId,
			productId: pro.id,
		});

		await autumnV1.subscriptions.update({
			customer_id: customerId,
			product_id: pro.id,
			cancel_action: "cancel_end_of_cycle",
		});

		await timeout(3000);

		const subsAfterCancel = await ctx.stripeCli.subscriptions.list({
			customer: stripeCustomerId,
		});
		expect(subsAfterCancel.data.length).toBeGreaterThan(0);

		const invoicesAfterCancel = await ctx.stripeCli.invoices.list({
			customer: stripeCustomerId,
			subscription: subscriptionId,
		});
		expect(
			invoicesAfterCancel.data.filter((inv) => inv.status === "open").length,
		).toBeGreaterThan(0);
		expect(
			invoicesAfterCancel.data.filter((inv) => inv.status === "void").length,
		).toBe(0);
	} finally {
		await OrgService.update({
			db: ctx.db,
			orgId: ctx.org.id,
			updates: { config: originalOrgConfig },
		});
	}
});

test(`${chalk.yellowBright("cancel eoc not past_due: flag on -> normal end-of-cycle (no immediate)")}`, async () => {
	const customerId = "cancel-pastdue-void-not-pastdue";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const free = products.base({
		id: "free",
		items: [messagesItem],
		isDefault: true,
	});
	const pro = products.pro({ id: "pro", items: [messagesItem] });

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [free, pro], customerIdsToDelete: [customerId] }),
		],
		actions: [s.attach({ productId: pro.id })],
	});

	const originalOrgConfig = ctx.org.config;
	await OrgService.update({
		db: ctx.db,
		orgId: ctx.org.id,
		updates: {
			config: {
				...ctx.org.config,
				void_invoices_on_subscription_deletion: true,
			},
		},
	});

	try {
		const customerAfterAttach =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectProductActive({
			customer: customerAfterAttach,
			productId: pro.id,
		});

		await autumnV1.subscriptions.update({
			customer_id: customerId,
			product_id: pro.id,
			cancel_action: "cancel_end_of_cycle",
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

		const customer = await CusService.get({
			db: ctx.db,
			idOrInternalId: customerId,
			orgId: ctx.org.id,
			env: ctx.env,
		});
		const subscriptionId = await getSubscriptionId({
			ctx,
			customerId,
			productId: pro.id,
		});
		const invoices = await ctx.stripeCli.invoices.list({
			customer: customer!.processor?.id,
			subscription: subscriptionId,
		});
		expect(invoices.data.filter((inv) => inv.status === "void").length).toBe(0);
	} finally {
		await OrgService.update({
			db: ctx.db,
			orgId: ctx.org.id,
			updates: { config: originalOrgConfig },
		});
	}
});
