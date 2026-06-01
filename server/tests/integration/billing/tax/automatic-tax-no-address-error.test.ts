/**
 * Regression guard for orgs that enable `automatic_tax` after customers
 * already have paid subscriptions but no Stripe tax location on file.
 *
 * Red-failure mode (current behavior):
 *  - Pro -> Premium upgrade sends `automatic_tax.enabled=true` to Stripe.
 *  - Stripe rejects with `customer_tax_location_invalid`.
 *
 * Green-success criteria (after fix):
 *  - Upgrade succeeds by falling back to no automatic tax for this mutation.
 *  - Resulting subscription and upgrade invoice have automatic tax disabled.
 */

import { expect, test } from "bun:test";
import type { AttachParamsV1Input } from "@autumn/shared";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { OrgService } from "@/internal/orgs/OrgService.js";

test.concurrent(
	`${chalk.yellowBright("automatic-tax-no-address (v2 pre-flip upgrade): succeeds without tax when Stripe customer has no location")}`,
	async () => {
		const customerId = "tax-no-address-preflip-upgrade";
		const pro = products.pro({ id: "pro", items: [] });
		const premium = products.premium({ id: "premium", items: [] });

		const { ctx, customer, autumnV2_2 } = await initScenario({
			customerId,
			setup: [
				s.platform.create({
					taxRegistrations: ["AU"],
				}),
				s.customer({
					testClock: false,
					paymentMethod: "success",
				}),
				s.products({ list: [pro, premium] }),
			],
			actions: [],
		});

		const stripeCustomerId = customer!.processor!.id!;
		const stripeCustomerBefore =
			await ctx.stripeCli.customers.retrieve(stripeCustomerId);
		if ("deleted" in stripeCustomerBefore && stripeCustomerBefore.deleted) {
			throw new Error("Stripe customer was unexpectedly deleted");
		}
		expect(stripeCustomerBefore.address).toBeNull();

		await OrgService.update({
			db: ctx.db,
			orgId: ctx.org.id,
			updates: {
				config: { ...ctx.org.config, automatic_tax: false },
			},
		});

		await autumnV2_2.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: pro.id,
		});

		const initialSubscriptions = await ctx.stripeCli.subscriptions.list({
			customer: stripeCustomerId,
			limit: 1,
		});
		expect(initialSubscriptions.data[0].automatic_tax.enabled).toBe(false);

		await OrgService.update({
			db: ctx.db,
			orgId: ctx.org.id,
			updates: {
				config: { ...ctx.org.config, automatic_tax: true },
			},
		});

		await autumnV2_2.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: premium.id,
		});

		const upgradedSubscriptions = await ctx.stripeCli.subscriptions.list({
			customer: stripeCustomerId,
			limit: 1,
		});
		const upgradedSubscription = upgradedSubscriptions.data[0];
		expect(upgradedSubscription).toBeDefined();
		expect(upgradedSubscription.automatic_tax.enabled).toBe(false);

		const invoices = await ctx.stripeCli.invoices.list({
			customer: stripeCustomerId,
			limit: 5,
		});
		const upgradeInvoice = invoices.data[0];
		expect(upgradeInvoice).toBeDefined();
		expect(upgradeInvoice.automatic_tax.enabled).toBe(false);
	},
	300_000,
);
