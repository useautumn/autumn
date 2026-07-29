/**
 * Contract: propagating a versioned child relinks a customerless parent in place.
 * The child customer remains on v1 while the parent catalog receives child v2.
 */
import { expect, test } from "bun:test";
import { type ApiCustomerV5, CustomerExpand } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { ProductService } from "@/internal/products/ProductService.js";
import { getFullLicenseProduct } from "../../utils/getFullLicenseProduct.js";

test.concurrent(
	`${chalk.yellowBright("plans.update: propagates child v2 into a customerless parent without versioning it")}`,
	async () => {
		const childCustomerId = "license-versioned-child-propagation-customer";
		const parent = products.base({
			id: "license-versioned-child-propagation-parent",
			items: [items.dashboard()],
		});
		const child = products.base({
			id: "license-versioned-child-propagation-seat",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const { autumnV2_3, ctx } = await initScenario({
			customerId: childCustomerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [parent, child] }),
			],
			actions: [
				s.licenses.link({
					parentProductId: parent.id,
					licenseProductId: child.id,
					included: 0,
				}),
				s.billing.attach({ productId: child.id }),
			],
		});
		const before = await getFullLicenseProduct({
			ctx,
			parentPlanId: parent.id,
			licensePlanId: child.id,
		});

		await autumnV2_3.post("/plans.update", {
			plan_id: child.id,
			items: [
				itemsV2.monthlyMessages({ included: 100 }),
				itemsV2.monthlyWords({ included: 50 }),
			],
			update_license_parents: [{ plan_id: parent.id, version: 1 }],
		});

		const [childV1, childV2, parentAfter, linkAfter, childCustomer] =
			await Promise.all([
				ProductService.getFull({
					db: ctx.db,
					idOrInternalId: child.id,
					orgId: ctx.org.id,
					env: ctx.env,
					version: 1,
				}),
				ProductService.getFull({
					db: ctx.db,
					idOrInternalId: child.id,
					orgId: ctx.org.id,
					env: ctx.env,
					version: 2,
				}),
				ProductService.getFull({
					db: ctx.db,
					idOrInternalId: parent.id,
					orgId: ctx.org.id,
					env: ctx.env,
				}),
				getFullLicenseProduct({
					ctx,
					parentPlanId: parent.id,
					licensePlanId: child.id,
				}),
				autumnV2_3.customers.get<ApiCustomerV5>(childCustomerId, {
					expand: [CustomerExpand.SubscriptionsPlan],
				}),
			]);

		expect(childV1.entitlements).toContainEqual(
			expect.objectContaining({
				feature_id: TestFeature.Messages,
				allowance: 100,
			}),
		);
		expect(childV1.entitlements).not.toContainEqual(
			expect.objectContaining({ feature_id: TestFeature.Words }),
		);
		expect(childV2.entitlements).toContainEqual(
			expect.objectContaining({
				feature_id: TestFeature.Words,
				allowance: 50,
			}),
		);
		expect(parentAfter).toMatchObject({
			version: 1,
			internal_id: before.parentProduct.internal_id,
		});
		expect(linkAfter.planLicense).toMatchObject({
			license_internal_product_id: childV2.internal_id,
			customized: false,
		});
		expect(linkAfter.planLicense.id).not.toBe(before.planLicense.id);
		expect(linkAfter.fullLicenseProduct.entitlements).toContainEqual(
			expect.objectContaining({
				feature_id: TestFeature.Words,
				allowance: 50,
			}),
		);
		expect(childCustomer.subscriptions[0]).toMatchObject({
			plan_id: child.id,
			plan: { version: 1 },
		});
		expect(childCustomer.subscriptions[0]?.plan?.items).not.toContainEqual(
			expect.objectContaining({ feature_id: TestFeature.Words }),
		);
	},
);
