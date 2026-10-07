/**
 * Long-lived checkout without enable_plan_immediately
 *
 * Contract:
 * - Creating the link inserts a pending customer product linked to the link's metadata.
 * - An expired Stripe session leaves it pending; reopening keeps it linked to the
 *   same metadata, now pointing at the new session.
 * - Paying through the link activates that same row.
 * - The cron expires the pending row once the link's 90 days pass.
 */

import { expect, test } from "bun:test";
import { CusProductStatus, metadata } from "@autumn/shared";
import { completeStripeCheckoutFormV2 as completeStripeCheckoutForm } from "@tests/utils/browserPool/completeStripeCheckoutFormV2";
import { waitForStripeWebhook } from "@tests/utils/stripeUtils/waitForStripeWebhook";
import chalk from "chalk";
import { eq } from "drizzle-orm";
import { runLongLivedCheckoutExpiry } from "@/cron/longLivedCheckoutCron/runLongLivedCheckoutExpiry";
import {
	findCustomerProductRow,
	getStripeSessionId,
	setupLongLivedScenario,
	startLongLivedCheckout,
} from "./utils/longLivedCheckoutUtils";

test.concurrent(
	`${chalk.yellowBright("long-lived checkout pending: inserts pending row at link creation and keeps it across session expiry")}`,
	async () => {
		const customerId = "ll-pending-expiry";
		const { ctx, pro, internalCustomerId, checkoutId } =
			await setupLongLivedScenario({
				customerId,
				enablePlanImmediately: false,
			});
		const findPendingRow = () =>
			findCustomerProductRow({
				ctx,
				internalCustomerId,
				productId: pro.id,
				status: CusProductStatus.Pending,
			});

		// 1. Pending row exists before the link is opened.
		const rowAtCreation = await findPendingRow();
		expect(rowAtCreation?.metadata_id).toBeTruthy();

		// 2. Expiring the Stripe session must not expire the row. The replay forces
		// delivery, so "still no effect" proves the webhook was a no-op.
		const firstSessionId = getStripeSessionId(
			await startLongLivedCheckout(checkoutId),
		);
		await ctx.stripeCli.checkout.sessions.expire(firstSessionId);
		await expect(
			waitForStripeWebhook({
				stripeCli: ctx.stripeCli,
				env: ctx.env,
				types: ["checkout.session.expired"],
				objectId: firstSessionId,
				until: async () => !(await findPendingRow()),
				replayAfterMs: 5_000,
				timeoutMs: 15_000,
			}),
		).rejects.toThrow("still no effect");

		// 3. Reopening keeps the same row linked to the same metadata, now on the new session.
		const secondSessionId = getStripeSessionId(
			await startLongLivedCheckout(checkoutId),
		);
		expect(secondSessionId).not.toBe(firstSessionId);

		const rowAfterReopen = await findPendingRow();
		expect(rowAfterReopen?.id).toBe(rowAtCreation!.id);
		const linkedMetadata = await ctx.db.query.metadata.findFirst({
			where: eq(metadata.id, rowAtCreation!.metadata_id!),
		});
		expect(linkedMetadata?.stripe_checkout_session_id).toBe(secondSessionId);
	},
);

test.concurrent(
	`${chalk.yellowBright("long-lived checkout pending: paying activates the pending row")}`,
	async () => {
		const customerId = "ll-pending-paid";
		const { ctx, pro, internalCustomerId, checkoutId } =
			await setupLongLivedScenario({
				customerId,
				enablePlanImmediately: false,
			});

		const pendingRow = await findCustomerProductRow({
			ctx,
			internalCustomerId,
			productId: pro.id,
			status: CusProductStatus.Pending,
		});
		expect(pendingRow).toBeDefined();

		const stripeUrl = await startLongLivedCheckout(checkoutId);
		await completeStripeCheckoutForm({ url: stripeUrl });

		await waitForStripeWebhook({
			stripeCli: ctx.stripeCli,
			env: ctx.env,
			types: ["checkout.session.completed"],
			objectId: getStripeSessionId(stripeUrl),
			until: async () => {
				const row = await findCustomerProductRow({
					ctx,
					internalCustomerId,
					productId: pro.id,
				});
				return (row?.subscription_ids ?? []).length === 1;
			},
		});

		const activeRow = await findCustomerProductRow({
			ctx,
			internalCustomerId,
			productId: pro.id,
		});
		expect(activeRow?.id).toBe(pendingRow!.id);
	},
);

test.concurrent(
	`${chalk.yellowBright("long-lived checkout pending: cron expires the pending row after link expiry")}`,
	async () => {
		const customerId = "ll-pending-cron";
		const { ctx, pro, internalCustomerId } = await setupLongLivedScenario({
			customerId,
			enablePlanImmediately: false,
		});
		const findRow = (status: CusProductStatus) =>
			findCustomerProductRow({
				ctx,
				internalCustomerId,
				productId: pro.id,
				status,
			});

		const pendingRow = await findRow(CusProductStatus.Pending);
		expect(pendingRow?.metadata_id).toBeTruthy();

		// 1. Before the link expires, the cron leaves the row alone.
		await runLongLivedCheckoutExpiry({ ctx });
		expect(await findRow(CusProductStatus.Pending)).toBeDefined();

		// 2. Once expired, the cron expires the pending row and drops its metadata.
		await ctx.db
			.update(metadata)
			.set({ expires_at: Date.now() - 1000 })
			.where(eq(metadata.id, pendingRow!.metadata_id!));
		await runLongLivedCheckoutExpiry({ ctx });

		expect((await findRow(CusProductStatus.Expired))?.id).toBe(pendingRow!.id);
		const remainingMetadata = await ctx.db.query.metadata.findFirst({
			where: eq(metadata.id, pendingRow!.metadata_id!),
		});
		expect(remainingMetadata).toBeUndefined();
	},
);
