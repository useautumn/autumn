/**
 * Regression: `billing.preview_attach` was provisioning a brand-new Stripe
 * customer (via getOrCreateStripeCustomer) on every call whenever the Autumn
 * customer had no `processor.id`. Because preview_attach is not in the
 * refresh-cache allowlist, the FullCustomer Redis cache stayed populated with
 * processor.id=null after each call, so subsequent preview_attach calls kept
 * minting fresh Stripe customers. Customers reported 5+ Stripe customers for
 * a single Autumn customer (athena, popfly tickets on 11 May 2026).
 *
 * Red-failure mode (current behavior):
 *  - After clearing the Autumn customer's processor and calling
 *    billing.preview_attach twice, the customer's processor.id is non-null
 *    (preview wrote a fresh stripe customer to the DB).
 *
 * Green-success criteria (after fix):
 *  - preview_attach must not call createStripeCustomer; the Autumn customer's
 *    processor.id remains null after multiple preview_attach calls.
 */

import { expect, test } from "bun:test";
import chalk from "chalk";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import { CusService } from "@/internal/customers/CusService";
import { deleteCachedFullCustomer } from "@/internal/customers/cusUtils/fullCustomerCacheUtils/deleteCachedFullCustomer";

test(
	`${chalk.yellowBright("preview_attach with no stripe customer: does not create one")}`,
	async () => {
		const customerId = "preview-no-stripe-cus-create";

		const pro = products.pro({
			id: "pro-no-stripe-cus",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { autumnV2_2, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [pro] }),
			],
			actions: [],
		});

		await CusService.update({
			ctx,
			idOrInternalId: customerId,
			update: { processor: null as unknown as undefined },
		});
		await deleteCachedFullCustomer({
			ctx,
			customerId,
			source: "test-clear-processor",
			skipGuard: true,
		});

		await autumnV2_2.billing.previewAttach({
			customer_id: customerId,
			plan_id: `pro-no-stripe-cus_${customerId}`,
		});
		await autumnV2_2.billing.previewAttach({
			customer_id: customerId,
			plan_id: `pro-no-stripe-cus_${customerId}`,
		});

		const fullCustomer = await CusService.getFull({
			ctx,
			idOrInternalId: customerId,
		});

		expect(fullCustomer.processor?.id ?? null).toBeNull();
	},
	300_000,
);
