import { expect } from "bun:test";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import type { initScenario } from "@tests/utils/testInitUtils/initScenario";
import type { Stripe } from "stripe";
import { OrgService } from "@/internal/orgs/OrgService";

type ScenarioCtx = Awaited<ReturnType<typeof initScenario>>["ctx"];

export const withVoidFlag = async ({
	ctx,
	enabled,
	fn,
}: {
	ctx: ScenarioCtx;
	enabled: boolean;
	fn: () => Promise<void>;
}): Promise<void> => {
	const originalConfig = ctx.org.config;
	await OrgService.update({
		db: ctx.db,
		orgId: ctx.org.id,
		updates: {
			config: {
				...ctx.org.config,
				void_invoices_on_subscription_deletion: enabled,
			},
		},
	});
	try {
		await fn();
	} finally {
		await OrgService.update({
			db: ctx.db,
			orgId: ctx.org.id,
			updates: { config: originalConfig },
		});
	}
};

// A past_due cancel must never credit the customer for the cycle they never paid:
// no negative-total invoice anywhere, and a zero Stripe customer balance.
export const expectNoCredit = async ({
	ctx,
	stripeCustomerId,
}: {
	ctx: ScenarioCtx;
	stripeCustomerId: string | undefined;
}): Promise<void> => {
	const allInvoices = await ctx.stripeCli.invoices.list({
		customer: stripeCustomerId,
	});
	expect(allInvoices.data.filter((inv) => (inv.total ?? 0) < 0).length).toBe(0);
	const stripeCustomer = (await ctx.stripeCli.customers.retrieve(
		stripeCustomerId!,
	)) as Stripe.Customer;
	expect(stripeCustomer.balance).toBe(0);
};

export const expectInvoicesVoided = async ({
	ctx,
	stripeCustomerId,
	subscriptionId,
}: {
	ctx: ScenarioCtx;
	stripeCustomerId: string | undefined;
	subscriptionId: string;
}): Promise<void> => {
	const invoices = await ctx.stripeCli.invoices.list({
		customer: stripeCustomerId,
		subscription: subscriptionId,
	});
	expect(invoices.data.filter((inv) => inv.status === "open").length).toBe(0);
	expect(
		invoices.data.filter((inv) => inv.status === "void").length,
	).toBeGreaterThan(0);
};

export const buildProductSet = () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const free = products.base({
		id: "free",
		items: [messagesItem],
		isDefault: true,
	});
	const pro = products.pro({ id: "pro", items: [messagesItem] });
	return { free, pro };
};
