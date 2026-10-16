/**
 * Releasing a Stripe subscription schedule from Stripe's side means its later
 * phases will never happen, so Autumn must stop expecting the plan to end.
 *
 * Red (current):  the customer.subscription.updated that drops the schedule
 *                 is ignored. The active plan keeps its phase-boundary
 *                 ended_at and the scheduled next-phase plan stays, so the
 *                 plan later expires while the subscription keeps billing.
 * Green (after):  ended_at is cleared, the scheduled plan is removed, and
 *                 billing.verify is clean.
 */

import { expect, test } from "bun:test";
import { CusProductStatus } from "@autumn/shared";
import {
	createStripeSubscriptionSchedule,
	getBaseStripePriceId,
} from "@tests/integration/billing/sync/utils/syncProductHelpers";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { pollUntil } from "@tests/utils/genUtils";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { billingActions } from "@/internal/billing/v2/actions";
import { subscriptionToSyncParams } from "@/internal/billing/v2/actions/sync/subscriptionToSyncParams";
import { CusService } from "@/internal/customers/CusService";
import { ProductService } from "@/internal/products/ProductService";

const basePriceIdFor = async ({ productId }: { productId: string }) =>
	getBaseStripePriceId({
		fullProduct: await ProductService.getFull({
			db: ctx.db,
			idOrInternalId: productId,
			orgId: ctx.org.id,
			env: ctx.env,
		}),
	});

const getPlanRows = async ({ customerId }: { customerId: string }) => {
	const fullCustomer = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
	});
	return fullCustomer.customer_products;
};

test(`${chalk.yellowBright("schedule released in Stripe: clears the phase end date and the scheduled next-phase plan")}`, async () => {
	const customerId = "schedule-released-end-date";

	const pro = products.pro({
		id: "pro",
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});
	const premium = products.premium({
		id: "premium",
		items: [items.monthlyMessages({ includedUsage: 500 })],
	});

	await initScenario({
		customerId,
		ctx,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
		],
		actions: [],
	});

	const { subscription, schedule } = await createStripeSubscriptionSchedule({
		ctx,
		customerId,
		phases: [
			{ items: [{ price: await basePriceIdFor({ productId: pro.id }) }] },
			{ items: [{ price: await basePriceIdFor({ productId: premium.id }) }] },
		],
	});
	// The sub.created auto-sync imports Pro on its own; syncing alongside it duplicates the plan.
	await pollUntil({
		fetch: () => getPlanRows({ customerId }),
		until: (rows) => rows.some((row) => row.product_id === pro.id),
		timeoutMs: 30000,
	});

	const { params } = await subscriptionToSyncParams({
		ctx,
		customerId,
		subscription,
		schedule,
	});
	await billingActions.syncV2({ ctx, params });

	const imported = await getPlanRows({ customerId });
	const importedPro = imported.find((row) => row.product_id === pro.id);
	expect(importedPro?.status).toBe(CusProductStatus.Active);
	expect(importedPro?.ended_at).not.toBeNull();
	expect(
		imported.some((row) => row.status === CusProductStatus.Scheduled),
	).toBe(true);

	await ctx.stripeCli.subscriptionSchedules.release(schedule.id);

	const released = await pollUntil({
		fetch: () => getPlanRows({ customerId }),
		until: (rows) =>
			rows.find((row) => row.product_id === pro.id)?.ended_at == null &&
			rows.every((row) => row.status !== CusProductStatus.Scheduled),
		timeoutMs: 30000,
	});

	const releasedPro = released.find((row) => row.product_id === pro.id);
	expect(releasedPro?.status).toBe(CusProductStatus.Active);
	expect(releasedPro?.ended_at).toBeNull();
	expect(releasedPro?.subscription_ids).toEqual([subscription.id]);
	expect(
		released.filter((row) => row.status === CusProductStatus.Scheduled),
	).toEqual([]);

	const verification = await billingActions.verify({
		ctx,
		params: { customer_id: customerId },
	});
	expect(
		verification.subscriptions.flatMap(({ mismatches }) => mismatches),
	).toEqual([]);
});
