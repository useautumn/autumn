/**
 * TDD test for backdated starts_at with new_billing_subscription.
 *
 * Contract under test:
 *   New behaviors:
 *     - A backdated recurring add-on can create a separate Stripe subscription when new_billing_subscription is true
 *     - An entity-scoped backdated attach can create a separate Stripe subscription when new_billing_subscription is true
 *   Side effects:
 *     - The new customer_product rows store the past starts_at and link to their new Stripe subscriptions
 */

import { test } from "bun:test";
import { type AttachParamsV1Input, ms } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { expectAttachBackdateCorrect } from "./expectAttachBackdateCorrect";

test.concurrent(
	`${chalk.yellowBright("starts_at backdate new sub: recurring add-on gets separate backdated subscription")}`,
	async () => {
		const customerId = "attach-starts-at-backdate-addon-new-sub";
		const pro = products.pro({
			id: "pro",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const addon = products.recurringAddOn({
			id: "addon",
			items: [items.monthlyUsers({ includedUsage: 5 })],
		});

		const { autumnV1, autumnV2_2, ctx, advancedTo } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, addon] }),
			],
			actions: [s.billing.attach({ productId: pro.id })],
		});

		const startsAt = advancedTo - ms.days(35);
		const result = await autumnV2_2.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: addon.id,
			starts_at: startsAt,
			new_billing_subscription: true,
		});

		await expectAttachBackdateCorrect({
			autumn: autumnV1,
			ctx,
			customerId,
			productId: addon.id,
			startsAt,
			result,
			minInvoiceTotal: 2000,
			minInvoiceLineCount: 2,
			expectedInvoiceCount: 2,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("starts_at backdate new sub: entity attach gets separate backdated subscription")}`,
	async () => {
		const customerId = "attach-starts-at-backdate-entity-new-sub";
		const pro = products.pro({
			id: "pro",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const premium = products.premium({
			id: "premium",
			items: [items.monthlyMessages({ includedUsage: 200 })],
		});

		const { autumnV1, autumnV2_2, ctx, advancedTo, entities } =
			await initScenario({
				customerId,
				setup: [
					s.customer({ paymentMethod: "success" }),
					s.products({ list: [pro, premium] }),
					s.entities({ count: 1, featureId: TestFeature.Users }),
				],
				actions: [s.billing.attach({ productId: pro.id })],
			});

		const startsAt = advancedTo - ms.days(35);
		const result = await autumnV2_2.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			entity_id: entities[0]!.id,
			plan_id: premium.id,
			starts_at: startsAt,
			new_billing_subscription: true,
		});

		await expectAttachBackdateCorrect({
			autumn: autumnV1,
			ctx,
			customerId,
			productId: premium.id,
			startsAt,
			result,
			minInvoiceTotal: 5000,
			minInvoiceLineCount: 2,
			expectedInvoiceCount: 2,
		});
	},
);
