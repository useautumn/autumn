/**
 * Billing Verify: Export rows
 *
 * Contract under test (verifyCustomerToExportRows, billing_verify producer):
 *   - A verified customer yields no rows.
 *   - A drifted customer yields one row per mismatch.
 *   - A sweep gone stale never reaches the file: flagged customers are
 *     re-verified live before any row is written.
 *   - The producer walks the filtered population and emits a CSV holding
 *     only the drifted customer.
 *   - A real org-wide sweep screens customers to the same rows as live reads.
 */

import { expect, test } from "bun:test";
import { CustomerExportKind } from "@autumn/shared";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import type { TestContext } from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { createStripeCli } from "@/external/connect/createStripeCli";
import { CusService } from "@/internal/customers/CusService";
import { resolveCustomerExportPopulation } from "@/internal/customers/exports/queries/getCustomerExportScalars";
import { createBillingVerifyStripeReader } from "@/internal/customers/exports/verify/createBillingVerifyStripeReader";
import {
	type BillingVerifySweep,
	setupBillingVerifySweep,
} from "@/internal/customers/exports/verify/setupBillingVerifySweep";
import { verifyCustomerToExportRows } from "@/internal/customers/exports/verify/verifyCustomerToExportRows";
import { CUSTOMER_EXPORT_PRODUCERS } from "@/internal/customers/exports/workflows/upload/customerExportProducers";
import { ProductService } from "@/internal/products/ProductService";
import {
	corruptStripeSubscription,
	listActiveStripeSubscriptions,
} from "../restore/utils/corruptStripeSubscription";

/** An org-wide Stripe list omits test-clock customers, so sweep cases opt out. */
const setupSubscribedCustomer = async ({
	customerId,
	testClock = true,
}: {
	customerId: string;
	testClock?: boolean;
}) => {
	const pro = products.pro({
		id: "pro",
		items: [items.consumableMessages({ includedUsage: 200 })],
	});
	const { ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success", testClock }),
			s.products({ list: [pro] }),
		],
		actions: [s.billing.attach({ productId: pro.id })],
	});

	const fullCustomer = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
	});
	const stripeCustomerId = fullCustomer.processor?.id;
	if (!stripeCustomerId) throw new Error("Customer has no Stripe customer ID");

	const subscriptions = await listActiveStripeSubscriptions({
		ctx,
		stripeCustomerId,
	});
	const scalar = {
		internal_id: fullCustomer.internal_id,
		id: fullCustomer.id ?? null,
		name: fullCustomer.name ?? null,
		email: fullCustomer.email ?? null,
		processor: fullCustomer.processor ?? null,
	};

	return { ctx, pro, scalar, stripeCustomerId, subscriptions };
};

const sweepOf = ({
	ctx,
	subscriptionsByStripeCustomerId,
}: {
	ctx: TestContext;
	subscriptionsByStripeCustomerId: BillingVerifySweep["sweptSubscriptions"];
}): BillingVerifySweep => ({
	stripeReader: createBillingVerifyStripeReader({
		stripeCli: createStripeCli({ org: ctx.org, env: ctx.env }),
	}),
	sweptSubscriptions: subscriptionsByStripeCustomerId,
});

const basePriceIdFor = async ({
	ctx,
	productId,
}: {
	ctx: TestContext;
	productId: string;
}) => {
	const fullProduct = await ProductService.getFull({
		db: ctx.db,
		idOrInternalId: productId,
		orgId: ctx.org.id,
		env: ctx.env,
	});
	const basePrice = fullProduct.prices.find(
		(price) => !price.config.feature_id,
	);
	const id = basePrice?.config.stripe_price_id;
	if (!id) throw new Error(`No base Stripe price id on product ${productId}`);
	return id;
};

test.concurrent(
	`${chalk.yellowBright("billing-verify export 1: verified customer -> no rows")}`,
	async () => {
		const { ctx, scalar, stripeCustomerId, subscriptions } =
			await setupSubscribedCustomer({ customerId: "verify-export-clean" });

		const rows = await verifyCustomerToExportRows({
			ctx,
			scalar,
			sweep: sweepOf({
				ctx,
				subscriptionsByStripeCustomerId: new Map([
					[stripeCustomerId, subscriptions],
				]),
			}),
		});

		expect(rows).toEqual([]);
	},
);

test.concurrent(
	`${chalk.yellowBright("billing-verify export 2: drifted customer -> one row per mismatch")}`,
	async () => {
		const customerId = "verify-export-drifted";
		const { ctx, pro, scalar, stripeCustomerId, subscriptions } =
			await setupSubscribedCustomer({ customerId });

		await corruptStripeSubscription({
			ctx,
			subscriptionId: subscriptions[0].id,
			mutations: {
				removeItemPriceIds: [await basePriceIdFor({ ctx, productId: pro.id })],
			},
		});
		const subscriptionsByStripeCustomerId = new Map([
			[
				stripeCustomerId,
				await listActiveStripeSubscriptions({ ctx, stripeCustomerId }),
			],
		]);

		const rows = await verifyCustomerToExportRows({
			ctx,
			scalar,
			sweep: sweepOf({ ctx, subscriptionsByStripeCustomerId }),
		});

		expect(rows).toMatchObject([
			{
				customer_id: customerId,
				stripe_customer_id: stripeCustomerId,
				stripe_subscription_id: subscriptions[0].id,
				severity: "error",
				type: "base_price_mismatch",
			},
		]);
		expect(rows[0].message).toBeTruthy();
	},
);

test.concurrent(
	`${chalk.yellowBright("billing-verify export 3: stale sweep flags a healthy customer -> live re-verify clears it")}`,
	async () => {
		const { ctx, scalar } = await setupSubscribedCustomer({
			customerId: "verify-export-stale-sweep",
		});

		const rows = await verifyCustomerToExportRows({
			ctx,
			scalar,
			sweep: sweepOf({ ctx, subscriptionsByStripeCustomerId: new Map() }),
		});

		expect(rows).toEqual([]);
	},
);

test.concurrent(
	`${chalk.yellowBright("billing-verify export 4: producer -> CSV holds only the drifted customer")}`,
	async () => {
		const searchTerm = "verify-export-stream";
		const healthy = await setupSubscribedCustomer({
			customerId: `${searchTerm}-healthy`,
		});
		const drifted = await setupSubscribedCustomer({
			customerId: `${searchTerm}-drifted`,
		});
		const { ctx } = drifted;

		await corruptStripeSubscription({
			ctx,
			subscriptionId: drifted.subscriptions[0].id,
			mutations: {
				removeItemPriceIds: [
					await basePriceIdFor({ ctx, productId: drifted.pro.id }),
				],
			},
		});

		const snapshot = { search: searchTerm, filters: {} };
		const { population, totalCount } = await resolveCustomerExportPopulation({
			db: ctx.db,
			orgId: ctx.org.id,
			env: ctx.env,
			snapshot,
			createdAtCutoff: Date.now(),
		});
		expect(totalCount).toBe(2);

		const pages: { customerCount: number; rowCount: number }[] = [];
		const { createRowStream, createStringifier } =
			CUSTOMER_EXPORT_PRODUCERS[CustomerExportKind.BillingVerify];
		const csvStream = createRowStream({
			ctx,
			snapshot,
			population,
			totalCount,
			onPageProcessed: (page) => {
				pages.push(page);
			},
		}).pipe(createStringifier({ fields: [] }));

		let csv = "";
		for await (const chunk of csvStream) csv += chunk;
		const lines = csv.trim().split("\r\n");

		expect(pages).toEqual([{ customerCount: 2, rowCount: 1 }]);
		expect(lines.length).toBe(2);
		expect(lines[1]).toContain(`${searchTerm}-drifted`);
		expect(lines[1]).toContain("base_price_mismatch");
		expect(csv).not.toContain(`${searchTerm}-healthy`);
		expect(healthy.scalar.id).toBe(`${searchTerm}-healthy`);
	},
);

test.concurrent(
	`${chalk.yellowBright("billing-verify export 5: real org-wide sweep -> same rows as live reads")}`,
	async () => {
		const healthy = await setupSubscribedCustomer({
			customerId: "verify-export-sweep-healthy",
			testClock: false,
		});
		const drifted = await setupSubscribedCustomer({
			customerId: "verify-export-sweep-drifted",
			testClock: false,
		});
		const { ctx } = drifted;

		await corruptStripeSubscription({
			ctx,
			subscriptionId: drifted.subscriptions[0].id,
			mutations: {
				removeItemPriceIds: [
					await basePriceIdFor({ ctx, productId: drifted.pro.id }),
				],
			},
		});

		const sweep = await setupBillingVerifySweep({
			ctx,
			totalCount: Number.MAX_SAFE_INTEGER,
		});

		expect(
			sweep.sweptSubscriptions
				?.get(healthy.stripeCustomerId)
				?.map((subscription) => subscription.id),
		).toEqual([healthy.subscriptions[0].id]);
		expect(
			await verifyCustomerToExportRows({
				ctx,
				scalar: healthy.scalar,
				sweep,
			}),
		).toEqual([]);
		expect(
			await verifyCustomerToExportRows({
				ctx,
				scalar: drifted.scalar,
				sweep,
			}),
		).toMatchObject([
			{
				stripe_subscription_id: drifted.subscriptions[0].id,
				type: "base_price_mismatch",
			},
		]);
	},
);
