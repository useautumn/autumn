/**
 * Resend-shaped batch: paid pro, catalog-v2 remints Autumn base-price ids
 * (same Stripe/amount), migration is version + customize remove+add on one
 * feature. That remint is not a billing change and must stay on the batch lane.
 *
 * Red (before):  base_price_transition → per-customer.
 * Green (after): batch; product repoints; customize replace lands on FROM items.
 */
import { expect, test } from "bun:test";
import { type ApiCustomerV3, productToBasePrice } from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { ProductService } from "@/internal/products/ProductService.js";
import { expectCustomerEntitlementRowCount } from "../../batchTestUtils";
import { readScopedFeatureRow } from "../../paidRowTestUtils";
import { expectVersionRepointedOnce } from "../utils/versionDiffTestUtils";
import {
	readRepointableCustomerPlanRow,
	runVersionRepointMigration,
} from "../utils/versionRepointTestUtils";

const uniqueStem = (name: string) =>
	`${name}-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;

const readPlanBasePrice = async ({
	ctx,
	planId,
	version,
}: {
	ctx: Awaited<ReturnType<typeof initScenario>>["ctx"];
	planId: string;
	version: number;
}) => {
	const product = await ProductService.getFull({
		db: ctx.db,
		idOrInternalId: planId,
		orgId: ctx.org.id,
		env: ctx.env,
		version,
	});
	const price = productToBasePrice({ product });
	if (!price) throw new Error(`Expected a base price on ${planId} v${version}`);
	return price;
};

test.concurrent(
	`${chalk.yellowBright("batch version+customize: reminted $20 base price stays on the batch lane")}`,
	async () => {
		const stem = uniqueStem("bvrt-base-remint");
		const customerId = `${stem}-customer`;
		const catalogMessages = 5;
		const customizedMessages = 10;
		const plan = products.pro({
			id: `${stem}-plan`,
			items: [items.monthlyMessages({ includedUsage: catalogMessages })],
		});

		const { ctx, autumnV1, autumnV2_3 } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false, paymentMethod: "success" }),
				s.products({ list: [plan] }),
			],
			actions: [s.billing.attach({ productId: plan.id })],
		});

		await autumnV2_3.post("/plans.update", {
			plan_id: plan.id,
			force_version: true,
			items: [itemsV2.monthlyMessages({ included: catalogMessages })],
			price: itemsV2.monthlyPrice({ amount: 20 }),
		});

		const fromPrice = await readPlanBasePrice({
			ctx,
			planId: plan.id,
			version: 1,
		});
		const toPrice = await readPlanBasePrice({
			ctx,
			planId: plan.id,
			version: 2,
		});
		expect(fromPrice.id).not.toBe(toPrice.id);
		expect(fromPrice.config.amount).toBe(20);
		expect(toPrice.config.amount).toBe(20);
		expect(fromPrice.config.stripe_price_id).toBe(
			toPrice.config.stripe_price_id,
		);

		const invoiceCountBefore =
			(await autumnV1.customers.get<ApiCustomerV3>(customerId)).invoices
				?.length ?? 0;
		const messagesBefore = await readScopedFeatureRow({
			ctx,
			customerId,
			featureId: TestFeature.Messages,
		});
		const before = await readRepointableCustomerPlanRow({
			ctx,
			customerId,
			planId: plan.id,
		});

		const { result } = await runVersionRepointMigration({
			ctx,
			migrationClient: autumnV2_3,
			migrationId: `${stem}-migration`,
			filter: { customer: { plan: { plan_id: plan.id, version: 1 } } },
			operations: {
				customer: [
					{
						type: "update_plan",
						plan_filter: { plan_id: plan.id, version: 1 },
						version: 2,
						customize: {
							remove_items: [{ feature_id: TestFeature.Messages }],
							add_items: [
								itemsV2.monthlyMessages({ included: customizedMessages }),
							],
						},
					},
				],
			},
		});

		await expectVersionRepointedOnce({
			ctx,
			customerId,
			planId: plan.id,
			before,
			targetVersion: 2,
			result,
		});

		const messagesAfter = await readScopedFeatureRow({
			ctx,
			customerId,
			featureId: TestFeature.Messages,
		});
		expect(messagesAfter.id).toBe(messagesBefore.id);
		expect(messagesAfter.entitlement_id).not.toBe(
			messagesBefore.entitlement_id,
		);
		expect(messagesAfter.balance).toBe(customizedMessages);
		await expectCustomerEntitlementRowCount({
			ctx,
			customerId,
			planId: plan.id,
			featureId: TestFeature.Messages,
			count: 1,
		});
		await expectCustomerInvoiceCorrect({
			customer: await autumnV1.customers.get<ApiCustomerV3>(customerId),
			count: invoiceCountBefore,
		});
	},
);
