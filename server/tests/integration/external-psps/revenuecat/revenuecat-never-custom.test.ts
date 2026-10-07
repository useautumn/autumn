/**
 * RevenueCat customer products are never custom: a purchase arrives from an
 * app-store event with no params, so a divergence from the catalog is drift,
 * not a customisation, and must not lock the row out of version migrations.
 */

import { expect, test } from "bun:test";
import { ProcessorType } from "@autumn/shared";
import { runUpdatePlanMigration } from "@tests/integration/billing/migrations-v2/utils/runUpdatePlanMigration";
import { items } from "@tests/utils/fixtures/items";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import {
	findActiveCusProduct,
	mapProduct,
	newRcClient,
	rcPlan,
	setupRevenueCatOrg,
} from "./utils/revenue-cat-transfer-test-utils";
import {
	expectWebhookSuccess,
	type RevenueCatWebhookClient,
} from "./utils/revenue-cat-webhook-client";

const purchaseRcPlan = async ({
	rcClient,
	customerId,
	rcProductId,
}: {
	rcClient: RevenueCatWebhookClient;
	customerId: string;
	rcProductId: string;
}) => {
	const result = await rcClient.initialPurchase({
		productId: rcProductId,
		appUserId: customerId,
		originalTransactionId: `${customerId}_tx_001`,
	});
	expectWebhookSuccess(result);
};

const expectActiveCusProduct = async ({
	customerId,
	autumnProductId,
	isCustom,
	processorType,
	version,
}: {
	customerId: string;
	autumnProductId: string;
	isCustom: boolean;
	processorType?: ProcessorType;
	version?: number;
}) => {
	const cusProduct = await findActiveCusProduct({
		customerId,
		autumnProductId,
	});
	expect(cusProduct).toBeDefined();
	expect(cusProduct?.is_custom).toBe(isCustom);
	if (processorType) expect(cusProduct?.processor?.type).toBe(processorType);
	if (version) expect(cusProduct?.product.version).toBe(version);
};

test.concurrent(
	`${chalk.yellowBright("rc never custom: customized version migration keeps the new row non-custom")}`,
	async () => {
		const customerId = "rc-never-custom-version";
		const rcProductId = "com.app.rc_never_custom_version";
		const plan = rcPlan({ id: "rc-never-custom-version-plan" });

		await setupRevenueCatOrg();
		const { ctx, autumnV1, autumnV2_2 } = await initScenario({
			customerId,
			setup: [s.customer({ testClock: false }), s.products({ list: [plan] })],
			actions: [],
		});
		await mapProduct({
			autumnProductId: plan.id,
			revenuecatProductId: rcProductId,
		});

		await purchaseRcPlan({ rcClient: newRcClient(), customerId, rcProductId });
		await expectActiveCusProduct({
			customerId,
			autumnProductId: plan.id,
			isCustom: false,
			processorType: ProcessorType.RevenueCat,
		});

		await autumnV1.products.update(plan.id, {
			items: [
				items.monthlyMessages({ includedUsage: 200 }),
				items.monthlyPrice({ price: 10 }),
			],
		});

		await runUpdatePlanMigration({
			ctx,
			migrationClient: autumnV2_2,
			migrationId: `${customerId}-mig`,
			customerId,
			filter: { customer: { plan: { plan_id: plan.id, version: 1 } } },
			operations: {
				customer: [
					{
						type: "update_plan",
						plan_filter: { plan_id: plan.id, version: 1 },
						version: 2,
						customize: { add_items: [itemsV2.dashboard()] },
					},
				],
			},
			runOnServer: false,
			noBillingChanges: true,
		});

		await expectActiveCusProduct({
			customerId,
			autumnProductId: plan.id,
			isCustom: false,
			processorType: ProcessorType.RevenueCat,
			version: 2,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("rc never custom: customize-only migration keeps the patched row non-custom")}`,
	async () => {
		const customerId = "rc-never-custom-patch";
		const rcProductId = "com.app.rc_never_custom_patch";
		const plan = rcPlan({ id: "rc-never-custom-patch-plan" });

		await setupRevenueCatOrg();
		const { ctx, autumnV2_2 } = await initScenario({
			customerId,
			setup: [s.customer({ testClock: false }), s.products({ list: [plan] })],
			actions: [],
		});
		await mapProduct({
			autumnProductId: plan.id,
			revenuecatProductId: rcProductId,
		});

		await purchaseRcPlan({ rcClient: newRcClient(), customerId, rcProductId });

		await runUpdatePlanMigration({
			ctx,
			migrationClient: autumnV2_2,
			migrationId: `${customerId}-mig`,
			customerId,
			filter: { customer: { plan: { plan_id: plan.id } } },
			operations: {
				customer: [
					{
						type: "update_plan",
						plan_filter: { plan_id: plan.id },
						customize: { add_items: [itemsV2.dashboard()] },
					},
				],
			},
			runOnServer: false,
			noBillingChanges: true,
		});

		await expectActiveCusProduct({
			customerId,
			autumnProductId: plan.id,
			isCustom: false,
			processorType: ProcessorType.RevenueCat,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("rc never custom: renewal product change lands a non-custom row")}`,
	async () => {
		const customerId = "rc-never-custom-renewal";
		const rcMonthlyId = "com.app.rc_never_custom_renewal_monthly";
		const rcYearlyId = "com.app.rc_never_custom_renewal_yearly";
		const monthly = rcPlan({
			id: "rc-never-custom-renewal-monthly",
			group: "rc-never-custom-renewal",
		});
		const yearly = products.base({
			id: "rc-never-custom-renewal-yearly",
			group: "rc-never-custom-renewal",
			items: [
				items.monthlyMessages({ includedUsage: 1000 }),
				items.annualPrice({ price: 100 }),
			],
		});

		await setupRevenueCatOrg();
		await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [monthly, yearly] }),
			],
			actions: [],
		});
		await Promise.all([
			mapProduct({
				autumnProductId: monthly.id,
				revenuecatProductId: rcMonthlyId,
			}),
			mapProduct({
				autumnProductId: yearly.id,
				revenuecatProductId: rcYearlyId,
			}),
		]);

		const rcClient = newRcClient();
		await purchaseRcPlan({ rcClient, customerId, rcProductId: rcMonthlyId });

		const renewal = await rcClient.renewal({
			productId: rcYearlyId,
			appUserId: customerId,
			originalTransactionId: `${customerId}_tx_001`,
		});
		expectWebhookSuccess(renewal);

		await expectActiveCusProduct({
			customerId,
			autumnProductId: yearly.id,
			isCustom: false,
			processorType: ProcessorType.RevenueCat,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("rc never custom: a Stripe row customized by migration is still custom")}`,
	async () => {
		const customerId = "rc-never-custom-stripe";
		const plan = products.base({
			id: "rc-never-custom-stripe-plan",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { ctx, autumnV2_2 } = await initScenario({
			customerId,
			setup: [s.customer({ testClock: false }), s.products({ list: [plan] })],
			actions: [s.billing.attach({ productId: plan.id })],
		});

		await runUpdatePlanMigration({
			ctx,
			migrationClient: autumnV2_2,
			migrationId: `${customerId}-mig`,
			customerId,
			filter: { customer: { plan: { plan_id: plan.id } } },
			operations: {
				customer: [
					{
						type: "update_plan",
						plan_filter: { plan_id: plan.id },
						customize: { add_items: [itemsV2.dashboard()] },
					},
				],
			},
			runOnServer: false,
			noBillingChanges: true,
		});

		await expectActiveCusProduct({
			customerId,
			autumnProductId: plan.id,
			isCustom: true,
		});
	},
);
