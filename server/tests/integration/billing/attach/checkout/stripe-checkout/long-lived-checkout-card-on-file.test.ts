/**
 * Long-lived checkout opened after the customer added a card
 *
 * Links created before the start stored their Stripe session have no response,
 * so opening them re-runs the attach.
 *
 * Contract:
 * - Opening the link charges the card on file directly and redirects to the success URL.
 * - The checkout is stored as completed with the billing response.
 * - Reopening the link does not attach or charge again.
 */

import { expect, test } from "bun:test";
import {
	type ApiCustomerV3,
	type AttachParamsV1Input,
	CheckoutStatus,
	customers,
} from "@autumn/shared";
import { expectProductActive } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { eq } from "drizzle-orm";
import { checkoutActions } from "@/internal/checkouts/actions";
import { checkoutRepo } from "@/internal/checkouts/repos/checkoutRepo";
import { toSuccessUrl } from "@/internal/orgs/orgUtils/convertOrgUtils";
import { attachPaymentMethod } from "@/utils/scriptUtils/initCustomer";
import {
	getLongLivedCheckoutId,
	requestLongLivedCheckoutStart,
} from "./utils/longLivedCheckoutUtils";

test.concurrent(
	`${chalk.yellowBright("long-lived checkout: card added after link creation is charged once and redirects to success")}`,
	async () => {
		const customerId = "ll-card-on-file";
		const pro = products.pro({
			id: `pro-${customerId}`,
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { autumnV1, autumnV2_2, ctx } = await initScenario({
			customerId,
			setup: [s.customer({ testClock: true }), s.products({ list: [pro] })],
			actions: [],
		});

		const result = await autumnV2_2.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: pro.id,
			long_lived_checkout: true,
		});
		const checkoutId = getLongLivedCheckoutId(result.payment_url);
		await checkoutActions.updateDbAndCache({
			ctx,
			oldCheckout: (await checkoutRepo.get({ db: ctx.db, id: checkoutId }))!,
			updates: { response: null },
		});

		const dbCustomer = await ctx.db.query.customers.findFirst({
			where: eq(customers.id, customerId),
		});
		const stripeCustomerId = dbCustomer!.processor!.id!;
		await attachPaymentMethod({
			stripeCli: ctx.stripeCli,
			stripeCusId: stripeCustomerId,
			type: "success",
		});

		const startResponse = await requestLongLivedCheckoutStart(checkoutId);
		expect(startResponse.status).toBe(303);
		expect(startResponse.headers.get("location")).toBe(
			toSuccessUrl({ org: ctx.org, env: ctx.env }),
		);

		await expectProductActive({
			customer: await autumnV1.customers.get<ApiCustomerV3>(customerId),
			productId: pro.id,
		});

		const checkout = await checkoutRepo.get({ db: ctx.db, id: checkoutId });
		expect(checkout?.status).toBe(CheckoutStatus.Completed);
		expect(checkout?.response?.invoice?.status).toBe("paid");

		const reopenResponse = await requestLongLivedCheckoutStart(checkoutId);
		expect(reopenResponse.status).toBe(409);

		const invoices = await ctx.stripeCli.invoices.list({
			customer: stripeCustomerId,
			limit: 100,
		});
		expect(
			invoices.data.filter((invoice) => invoice.amount_paid > 0),
		).toHaveLength(1);
	},
);
