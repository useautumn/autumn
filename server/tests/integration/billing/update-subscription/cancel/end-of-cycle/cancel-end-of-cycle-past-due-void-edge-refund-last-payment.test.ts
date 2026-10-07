// Edge coverage for void-on-cancel of past_due customers: no unpaid-cycle credit, no shared-sub
// collateral void, void-correctness. Cases mutate shared org.config via withVoidFlag.

import { expect, test } from "bun:test";
import { type ApiCustomerV3, ErrCode } from "@autumn/shared";
import { driveProductPastDue } from "@tests/integration/billing/utils/driveProductPastDue";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import {
	buildProductSet,
	expectNoCredit,
	withVoidFlag,
} from "./utils/pastDueVoidEdgeUtils";

test(`${chalk.yellowBright("edge: refund_last_payment=full on unpaid past_due rejects without cancellation")}`, async () => {
	const customerId = "qa-refund-last-payment";
	const { free, pro } = buildProductSet();
	const { autumnV1, ctx, testClockId } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: true, paymentMethod: "success" }),
			s.products({ list: [free, pro], customerIdsToDelete: [customerId] }),
		],
		actions: [s.attach({ productId: pro.id })],
	});

	await withVoidFlag({
		ctx,
		enabled: true,
		fn: async () => {
			const { subscriptionId, stripeCustomerId } = await driveProductPastDue({
				ctx,
				testClockId: testClockId!,
				customerId,
				productId: pro.id,
			});
			const subscriptionBefore =
				await ctx.stripeCli.subscriptions.retrieve(subscriptionId);
			await expectAutumnError({
				errCode: ErrCode.InvalidRequest,
				errMessage: "Could not resolve a charge from the invoice to refund",
				func: () =>
					autumnV1.subscriptions.update({
						customer_id: customerId,
						product_id: pro.id,
						cancel_action: "cancel_immediately",
						refund_last_payment: "full",
					}),
			});

			const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
			await expectCustomerProducts({
				customer,
				pastDue: [pro.id],
				notPresent: [free.id],
			});
			const subscriptionAfter =
				await ctx.stripeCli.subscriptions.retrieve(subscriptionId);
			expect(subscriptionAfter).toMatchObject({
				status: subscriptionBefore.status,
				cancel_at: subscriptionBefore.cancel_at,
				cancel_at_period_end: subscriptionBefore.cancel_at_period_end,
				ended_at: subscriptionBefore.ended_at,
			});
			const invoices = await ctx.stripeCli.invoices.list({
				customer: stripeCustomerId,
				subscription: subscriptionId,
			});
			expect(invoices.data.some((invoice) => invoice.status === "open")).toBe(
				true,
			);
			expect(invoices.data.some((invoice) => invoice.status === "void")).toBe(
				false,
			);
			await expectNoCredit({ ctx, stripeCustomerId });
		},
	});
});
