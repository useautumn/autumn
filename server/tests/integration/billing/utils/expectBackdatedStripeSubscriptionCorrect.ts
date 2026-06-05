import { expect } from "bun:test";
import { ms } from "@autumn/shared";
import type { initScenario } from "@tests/utils/testInitUtils/initScenario";
import type Stripe from "stripe";

type Ctx = Awaited<ReturnType<typeof initScenario>>["ctx"];

export const expectTimestampClose = ({
	actualSeconds,
	expectedMs,
	toleranceMs = ms.minutes(2),
}: {
	actualSeconds: number;
	expectedMs: number;
	toleranceMs?: number;
}) => {
	expect(Math.abs(actualSeconds * 1000 - expectedMs)).toBeLessThan(toleranceMs);
};

export const expectBackdatedStripeSubscriptionCorrect = async ({
	ctx,
	stripeSubscriptionId,
	startsAt,
	stripeInvoiceId,
	minInvoiceTotal,
	minInvoiceLineCount,
	expandSchedule = false,
}: {
	ctx: Ctx;
	stripeSubscriptionId: string;
	startsAt: number;
	stripeInvoiceId?: string;
	minInvoiceTotal?: number;
	minInvoiceLineCount?: number;
	expandSchedule?: boolean;
}): Promise<{
	stripeSubscription: Stripe.Subscription;
	stripeInvoice: Stripe.Invoice;
	stripeSchedule?: Stripe.SubscriptionSchedule;
}> => {
	const stripeSubscription = await ctx.stripeCli.subscriptions.retrieve(
		stripeSubscriptionId,
		{
			expand: ["latest_invoice", ...(expandSchedule ? ["schedule"] : [])],
		},
	);

	expectTimestampClose({
		actualSeconds: stripeSubscription.start_date,
		expectedMs: startsAt,
	});

	const latestInvoice = stripeSubscription.latest_invoice as Stripe.Invoice;
	expect(latestInvoice).toBeDefined();

	if (stripeInvoiceId !== undefined) {
		expect(latestInvoice.id).toBe(stripeInvoiceId);
	}

	if (minInvoiceTotal !== undefined) {
		expect(latestInvoice.total).toBeGreaterThan(minInvoiceTotal);
	}

	const stripeInvoice = await ctx.stripeCli.invoices.retrieve(
		latestInvoice.id,
		{
			expand: ["lines"],
		},
	);

	if (minInvoiceLineCount !== undefined) {
		expect(stripeInvoice.lines.data.length).toBeGreaterThanOrEqual(
			minInvoiceLineCount,
		);
	}

	return {
		stripeSubscription,
		stripeInvoice,
		stripeSchedule: expandSchedule
			? (stripeSubscription.schedule as Stripe.SubscriptionSchedule)
			: undefined,
	};
};
