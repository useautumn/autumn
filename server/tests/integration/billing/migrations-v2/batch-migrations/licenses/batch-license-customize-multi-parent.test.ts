import { expect, test } from "bun:test";
import { entitlements, planLicenses } from "@autumn/shared";
import { runChunkedMigration } from "@tests/integration/billing/migrations-v2/utils/runChunkedMigration";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { and, eq } from "drizzle-orm";
import { ProductService } from "@/internal/products/ProductService.js";

test(`${chalk.yellowBright("batch-license-customize: one op matching several parents prepares without a conflict error")}`, async () => {
	const proCustomerId = "multi-parent-pro-customer";
	const scaleCustomerId = "multi-parent-scale-customer";
	const idPrefix = "multi-parent";

	const devSeat = products.base({
		id: "dev-seat",
		items: [items.monthlyMessages({ includedUsage: 500 })],
		group: `${idPrefix}-seat-licenses`,
	});
	const pro = products.base({ id: "pro", items: [items.dashboard()] });
	const scale = products.base({
		id: "scale",
		items: [items.monthlyWords({ includedUsage: 100 })],
	});

	const { ctx, autumnV2_2 } = await initScenario({
		customerId: proCustomerId,
		setup: [
			s.customer({ paymentMethod: "success", testClock: false }),
			s.otherCustomers([{ id: scaleCustomerId, paymentMethod: "success" }]),
			s.products({ list: [pro, scale, devSeat], prefix: idPrefix }),
		],
		actions: [
			s.licenses.link({
				parentProductId: pro.id,
				licenseProductId: devSeat.id,
				included: 1,
			}),
			s.licenses.link({
				parentProductId: scale.id,
				licenseProductId: devSeat.id,
				included: 2,
			}),
			s.billing.attach({
				productId: pro.id,
				licenseQuantities: [{ licenseProductId: devSeat.id, quantity: 2 }],
			}),
			s.billing.attach({
				customerId: scaleCustomerId,
				productId: scale.id,
				licenseQuantities: [{ licenseProductId: devSeat.id, quantity: 2 }],
			}),
		],
	});

	const result = await runChunkedMigration({
		ctx,
		migrationClient: autumnV2_2,
		migrationId: `${idPrefix}-migration`,
		filter: {
			customer: {
				plan: { plan_id: { $in: [pro.id, scale.id] }, custom: false },
			},
		},
		operations: {
			customer: [
				{
					type: "update_plan",
					plan_filter: { plan_id: { $in: [pro.id, scale.id] }, custom: false },
					customize: {
						upsert_licenses: [
							{
								license_plan_id: devSeat.id,
								customize: { add_items: [itemsV2.dashboard()] },
							},
						],
					},
				},
			],
		},
		noBillingChanges: true,
	});

	expect(result).toBeDefined();

	const licenseProduct = await ProductService.getFull({
		db: ctx.db,
		idOrInternalId: devSeat.id,
		orgId: ctx.org.id,
		env: ctx.env,
	});

	const links = await ctx.db
		.select({ id: planLicenses.id })
		.from(planLicenses)
		.where(
			and(
				eq(
					planLicenses.license_internal_product_id,
					licenseProduct.internal_id,
				),
				eq(planLicenses.is_custom, true),
			),
		);
	expect(links).toHaveLength(2);

	const minted = await ctx.db
		.select({ id: entitlements.id, featureId: entitlements.feature_id })
		.from(entitlements)
		.where(
			and(
				eq(entitlements.internal_product_id, licenseProduct.internal_id),
				eq(entitlements.is_custom, true),
			),
		);
	const dashboardEntitlements = minted.filter(
		(entitlement) => entitlement.featureId === TestFeature.Dashboard,
	);
	expect(dashboardEntitlements).toHaveLength(1);
});
