/**
 * Long-lived checkout guards
 *
 * Contract:
 * - Renewal refuses (409) when the checkout's session no longer matches the
 *   metadata's session, and moves nothing.
 * - The expiry cron postpones a link it fails to process by a day, so it stops
 *   blocking the front of the queue.
 */

import { expect, test } from "bun:test";
import { metadata } from "@autumn/shared";
import chalk from "chalk";
import { addHours } from "date-fns";
import { eq } from "drizzle-orm";
import { runLongLivedCheckoutExpiry } from "@/cron/longLivedCheckoutCron/runLongLivedCheckoutExpiry";
import {
	findCustomerProductRow,
	getStripeSessionId,
	requestLongLivedCheckoutStart,
	setupLongLivedScenario,
	startLongLivedCheckout,
} from "./utils/longLivedCheckoutUtils";

const STALE_SESSION_ID = "cs_test_stale_long_lived_session";

test.concurrent(
	`${chalk.yellowBright("long-lived checkout guards: stale renewal returns 409 and moves nothing")}`,
	async () => {
		const customerId = "ll-guard-stale-renewal";
		const { ctx, pro, internalCustomerId, checkoutId } =
			await setupLongLivedScenario({ customerId, enablePlanImmediately: true });

		const sessionId = getStripeSessionId(
			await startLongLivedCheckout(checkoutId),
		);
		const pendingMetadata = await ctx.db.query.metadata.findFirst({
			where: eq(metadata.stripe_checkout_session_id, sessionId),
		});

		// Another renewal already moved the metadata to a newer session.
		await ctx.stripeCli.checkout.sessions.expire(sessionId);
		await ctx.db
			.update(metadata)
			.set({ stripe_checkout_session_id: STALE_SESSION_ID })
			.where(eq(metadata.id, pendingMetadata!.id));

		const response = await requestLongLivedCheckoutStart(checkoutId);
		expect(response.status).toBe(409);
		expect((await response.json()).code).toBe("invalid_request");

		const row = await findCustomerProductRow({
			ctx,
			internalCustomerId,
			productId: pro.id,
		});
		expect(row?.stripe_checkout_session_id).toBe(sessionId);
		const untouchedMetadata = await ctx.db.query.metadata.findFirst({
			where: eq(metadata.id, pendingMetadata!.id),
		});
		expect(untouchedMetadata?.stripe_checkout_session_id).toBe(
			STALE_SESSION_ID,
		);
	},
);

test.concurrent(
	`${chalk.yellowBright("long-lived checkout guards: cron postpones a link it fails to process")}`,
	async () => {
		const customerId = "ll-guard-cron-postpone";
		const { ctx, pro, internalCustomerId, checkoutId } =
			await setupLongLivedScenario({ customerId, enablePlanImmediately: true });

		const sessionId = getStripeSessionId(
			await startLongLivedCheckout(checkoutId),
		);
		const pendingMetadata = await ctx.db.query.metadata.findFirst({
			where: eq(metadata.stripe_checkout_session_id, sessionId),
		});

		// A session Stripe can't find makes processing throw.
		await ctx.db
			.update(metadata)
			.set({
				expires_at: Date.now() - 1000,
				stripe_checkout_session_id: STALE_SESSION_ID,
			})
			.where(eq(metadata.id, pendingMetadata!.id));
		await runLongLivedCheckoutExpiry({ ctx });

		const postponedMetadata = await ctx.db.query.metadata.findFirst({
			where: eq(metadata.id, pendingMetadata!.id),
		});
		expect(Number(postponedMetadata?.expires_at)).toBeGreaterThan(
			addHours(Date.now(), 23).getTime(),
		);
		expect(
			await findCustomerProductRow({
				ctx,
				internalCustomerId,
				productId: pro.id,
			}),
		).toBeDefined();
	},
);
