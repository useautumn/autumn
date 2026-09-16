/** Regression: the product cron must not expire a trial that Stripe or a priced license bills.
 * Red: the trial row is selected and expired; green: it stays active. */

import { expect, test } from "bun:test";
import {
	ALL_STATUSES,
	CusProductStatus,
	customerProducts,
} from "@autumn/shared";
import { getLicenseDbState } from "@tests/integration/licenses/licenseTestUtils.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { subMinutes } from "date-fns";
import { eq } from "drizzle-orm";
import { fetchExpiredTrialProducts } from "@/cron/productCron/fetchExpiredTrialProducts";
import { runProductCron } from "@/cron/productCron/runProductCron";
import { logger } from "@/external/logtail/logtailUtils";
import { CusService } from "@/internal/customers/CusService";

const pastTrialEnd = () => subMinutes(new Date(), 1).getTime();

test(`${chalk.yellowBright("product-cron: a Stripe-backed trial without customer prices is not expired")}`, async () => {
	const customerId = "expired-trial-stripe-owned";
	const free = products.base({
		id: "free",
		isDefault: true,
		items: [items.monthlyMessages({ includedUsage: 10 })],
	});
	const trial = products.baseWithTrial({
		id: "stripe-owned-trial",
		items: [items.dashboard()],
		trialDays: 7,
	});

	const { ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: false }),
			s.products({ list: [free, trial] }),
		],
		actions: [s.billing.attach({ productId: trial.id })],
	});

	const beforeCron = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
		inStatuses: ALL_STATUSES,
	});
	const trialCustomerProduct = beforeCron.customer_products.find(
		(customerProduct) => customerProduct.product_id === trial.id,
	);
	if (!trialCustomerProduct) throw new Error("trial product not found");

	await ctx.db
		.update(customerProducts)
		.set({
			subscription_ids: ["sub_stripe_owned"],
			trial_ends_at: pastTrialEnd(),
		})
		.where(eq(customerProducts.id, trialCustomerProduct.id));

	await runProductCron({ ctx: { db: ctx.db, logger } });

	const afterCron = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
		inStatuses: ALL_STATUSES,
	});
	const trialAfterCron = afterCron.customer_products.find(
		(customerProduct) => customerProduct.id === trialCustomerProduct.id,
	);
	expect(trialAfterCron?.status).toBe(CusProductStatus.Active);

	const activeDefault = afterCron.customer_products.find(
		(customerProduct) =>
			customerProduct.product_id === free.id &&
			customerProduct.status === CusProductStatus.Active,
	);
	expect(activeDefault).toBeUndefined();
});

test(`${chalk.yellowBright("product-cron: a priced license keeps its trial parent active")}`, async () => {
	const customerId = "expired-trial-priced-license";
	const free = products.base({
		id: "free",
		isDefault: true,
		items: [items.monthlyMessages({ includedUsage: 10 })],
	});
	const parent = products.baseWithTrial({
		id: "priced-license-parent",
		items: [items.dashboard()],
		trialDays: 7,
	});
	const seat = products.base({
		id: "priced-license-seat",
		items: [
			items.monthlyMessages({ includedUsage: 25 }),
			items.monthlyPrice({ price: 10 }),
		],
	});

	const { ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success", testClock: false }),
			s.entities({ count: 1, featureId: TestFeature.Users }),
			s.products({ list: [free, parent, seat] }),
		],
		actions: [
			s.licenses.link({
				parentProductId: parent.id,
				licenseProductId: seat.id,
				included: 1,
			}),
			s.billing.attach({ productId: parent.id }),
			s.licenses.assign({ licenseProductId: seat.id, entityIndex: 0 }),
		],
	});

	const beforeCron = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
		inStatuses: ALL_STATUSES,
	});
	const trialParent = beforeCron.customer_products.find(
		(customerProduct) => customerProduct.product_id === parent.id,
	);
	if (!trialParent) throw new Error("trial parent not found");

	await ctx.db
		.update(customerProducts)
		.set({ trial_ends_at: pastTrialEnd() })
		.where(eq(customerProducts.id, trialParent.id));

	await runProductCron({ ctx: { db: ctx.db, logger } });

	const dbState = await getLicenseDbState({ db: ctx.db, customerId });
	expect(dbState.products.find(({ id }) => id === trialParent.id)?.status).toBe(
		CusProductStatus.Active,
	);
	expect(dbState.pools).toHaveLength(1);
	expect(dbState.assignments[0]).toMatchObject({ status: "active" });
	expect(
		dbState.products.find(
			({ product_id, status }) =>
				product_id === free.id && status === CusProductStatus.Active,
		),
	).toBeUndefined();

	await ctx.db
		.update(customerProducts)
		.set({ subscription_ids: [] })
		.where(eq(customerProducts.id, trialParent.id));
	const selectedWithoutSubscription = await fetchExpiredTrialProducts({
		db: ctx.db,
		batchSize: 10,
		internalCustomerId: beforeCron.internal_id,
	});
	expect(selectedWithoutSubscription).toHaveLength(0);
});

test(`${chalk.yellowBright("product-cron: a free license still lets an unbilled trial parent expire")}`, async () => {
	const customerId = "expired-trial-free-license";
	const parent = products.baseWithTrial({
		id: "free-license-parent",
		items: [items.dashboard()],
		trialDays: 7,
	});
	const seat = products.base({
		id: "free-license-seat",
		items: [items.monthlyMessages({ includedUsage: 25 })],
	});

	const { ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: false }),
			s.entities({ count: 1, featureId: TestFeature.Users }),
			s.products({ list: [parent, seat] }),
		],
		actions: [
			s.licenses.link({
				parentProductId: parent.id,
				licenseProductId: seat.id,
				included: 1,
			}),
			s.billing.attach({ productId: parent.id }),
			s.licenses.assign({ licenseProductId: seat.id, entityIndex: 0 }),
		],
	});

	const fullCustomer = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
		inStatuses: ALL_STATUSES,
	});
	const trialParent = fullCustomer.customer_products.find(
		(customerProduct) => customerProduct.product_id === parent.id,
	);
	if (!trialParent) throw new Error("trial parent not found");

	await ctx.db
		.update(customerProducts)
		.set({ subscription_ids: [], trial_ends_at: pastTrialEnd() })
		.where(eq(customerProducts.id, trialParent.id));

	const selected = await fetchExpiredTrialProducts({
		db: ctx.db,
		batchSize: 10,
		internalCustomerId: fullCustomer.internal_id,
	});
	expect(selected.map(({ customerProduct }) => customerProduct.id)).toEqual([
		trialParent.id,
	]);
});
