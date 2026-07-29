/** Regression: product cron must expire selected trial rows even when full-customer product pagination omits them.
 * Red: row stays active; green: row becomes expired. */

import { expect, test } from "bun:test";
import {
	CusProductStatus,
	FreeTrialDuration,
	customerProducts,
	customers,
} from "@autumn/shared";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { and, eq } from "drizzle-orm";
import { runProductCron } from "@/cron/productCron/runProductCron";
import { logger } from "@/external/logtail/logtailUtils";
import { CusService } from "@/internal/customers/CusService";

const trialConfig = {
	length: 7,
	duration: FreeTrialDuration.Day,
	cardRequired: false,
};

test(
	`${chalk.yellowBright("product-cron: expires trial row omitted from full customer product page")}`,
	async () => {
		const customerId = "expired-trial-full-customer-limit";
		const oldTrial = products.base({
			id: "old-trial",
			group: "old-trial",
			items: [items.monthlyMessages({ includedUsage: 100 })],
			freeTrial: trialConfig,
		});
		const newerProducts = Array.from({ length: 16 }, (_, index) => {
			const id = `newer-trial-${index + 1}`;
			return products.base({
				id,
				group: id,
				items: [items.monthlyMessages({ includedUsage: 200 + index })],
				freeTrial: trialConfig,
			});
		});

		const { ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [oldTrial, ...newerProducts] }),
			],
			actions: [
				s.billing.attach({ productId: "old-trial" }),
				...newerProducts.map((product) =>
					s.billing.attach({ productId: product.id }),
				),
			],
		});

		const [customer] = await ctx.db
			.select({ internalId: customers.internal_id })
			.from(customers)
			.where(
				and(
					eq(customers.id, customerId),
					eq(customers.org_id, ctx.org.id),
					eq(customers.env, ctx.env),
				),
			);
		expect(customer).toBeDefined();

		const [trialCusProduct] = await ctx.db
			.select()
			.from(customerProducts)
			.where(
				and(
					eq(customerProducts.internal_customer_id, customer!.internalId),
					eq(customerProducts.product_id, oldTrial.id),
				),
			);
		expect(trialCusProduct).toBeDefined();

		const pastTrialEnd = Date.now() - 60_000;
		await ctx.db
			.update(customerProducts)
			.set({ created_at: 0, trial_ends_at: pastTrialEnd })
			.where(eq(customerProducts.id, trialCusProduct!.id));

		const fullCustomer = await CusService.getFull({
			ctx,
			idOrInternalId: customerId,
			withEntities: true,
			withSubs: true,
		});
		expect(
			fullCustomer.customer_products.some((cp) => cp.id === trialCusProduct!.id),
		).toBe(false);

		await runProductCron({ ctx: { db: ctx.db, logger } });

		const [expiredCusProduct] = await ctx.db
			.select({ status: customerProducts.status })
			.from(customerProducts)
			.where(eq(customerProducts.id, trialCusProduct!.id));

		expect(expiredCusProduct?.status).toBe(CusProductStatus.Expired);
	},
);
