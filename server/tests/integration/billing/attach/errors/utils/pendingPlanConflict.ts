import { expect } from "bun:test";
import type { AttachParamsV1Input } from "@autumn/shared";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";

/** Pro → premium upgrade whose first invoice fails on a declining card. */
export const initFailedUpgrade = async ({
	customerId,
	extraProducts = [],
}: {
	customerId: string;
	extraProducts?: ReturnType<typeof products.base>[];
}) => {
	const pro = products.pro({
		id: "pro",
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});
	const premium = products.premium({
		id: "premium",
		items: [items.monthlyMessages({ includedUsage: 500 })],
	});
	const scenario = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium, ...extraProducts] }),
		],
		actions: [
			s.billing.attach({ productId: pro.id }),
			s.attachPaymentMethod({ type: "fail" }),
		],
	});

	const first = await scenario.autumnV2_4.billing.attach<AttachParamsV1Input>({
		customer_id: customerId,
		plan_id: premium.id,
	});
	expect(first.required_action?.code).toBe("payment_failed");
	expect(first.invoice?.status).toBe("open");

	return { ...scenario, pro, premium, first };
};

export const expectOnlyOneOpenInvoice = async ({
	ctx,
	stripeCustomerId,
}: {
	ctx: Awaited<ReturnType<typeof initScenario>>["ctx"];
	stripeCustomerId: string;
}) => {
	const openInvoices = await ctx.stripeCli.invoices.list({
		customer: stripeCustomerId,
		status: "open",
		limit: 100,
	});
	expect(openInvoices.has_more).toBe(false);
	expect(openInvoices.data).toHaveLength(1);
};
