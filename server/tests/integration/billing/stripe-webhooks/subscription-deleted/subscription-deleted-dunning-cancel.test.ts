/**
 * Stripe's dunning rules can cancel a subscription the moment an upgrade's
 * proration charge fails (e.g. Cash App Pay, which Stripe never retries). The
 * resulting customer.subscription.deleted carries the idempotency key of
 * Autumn's own `invoices.pay` call, so it must not be mistaken for a
 * cancellation Autumn made itself.
 *
 * Red (before):  the deletion is skipped as autumn-originated — Pro stays
 *                active on a dead subscription and the upgrade invoice stays open
 * Green (after): Pro and the pending Premium are expired, the invoice is voided
 */

import { expect, test } from "bun:test";
import type { AttachParamsV1Input } from "@autumn/shared";
import { getSubscriptionId } from "@tests/integration/billing/utils/stripe/getSubscriptionId";
import { waitForCustomerProductExpired } from "@tests/integration/billing/utils/waitForCustomerProductExpired";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { pollUntil } from "@tests/utils/genUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { buildAutumnStripeIdempotencyKey } from "@/external/stripe/common/autumnStripeIdempotency";
import { OrgService } from "@/internal/orgs/OrgService";

test(`${chalk.yellowBright("sub.deleted: dunning cancel after a failed upgrade expires the plans and voids the invoice")}`, async () => {
	const customerId = "sub-deleted-dunning-cancel";
	const pro = products.pro({
		id: "pro",
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});
	const premium = products.premium({
		id: "premium",
		items: [items.monthlyMessages({ includedUsage: 500 })],
	});

	const { ctx, autumnV2_4 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
		],
		actions: [
			s.billing.attach({ productId: pro.id }),
			s.attachPaymentMethod({ type: "fail" }),
		],
	});

	// Webhooks read org config from the DB, so the flag must be persisted
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
		const subscriptionId = await getSubscriptionId({
			ctx,
			customerId,
			productId: pro.id,
		});

		const upgrade = await autumnV2_4.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: premium.id,
		});
		expect(upgrade.required_action?.code).toBe("payment_failed");
		const upgradeInvoiceId = upgrade.invoice!.stripe_id;

		// Sandbox dunning can't be configured to cancel, so cancel the way Stripe
		// did in production: stamped with the failed `invoices.pay` call's key.
		await ctx.stripeCli.subscriptions.cancel(subscriptionId, undefined, {
			idempotencyKey: buildAutumnStripeIdempotencyKey({
				source: "invoice.pay",
			}),
		});

		// Pro and the pending Premium both sit on the dead subscription
		await waitForCustomerProductExpired({
			db: ctx.db,
			orgId: ctx.org.id,
			env: ctx.env,
			stripeSubscriptionId: subscriptionId,
		});

		const upgradeInvoice = await pollUntil({
			fetch: () => ctx.stripeCli.invoices.retrieve(upgradeInvoiceId),
			until: (invoice) => invoice.status === "void",
		});
		expect(upgradeInvoice.status).toBe("void");
	} finally {
		await OrgService.update({
			db: ctx.db,
			orgId: ctx.org.id,
			updates: { config: originalOrgConfig },
		});
	}
});
