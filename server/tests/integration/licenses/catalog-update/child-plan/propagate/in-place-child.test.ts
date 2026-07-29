/**
 * Contract: a selected customerless parent inherits an in-place child update without versioning.
 * The catalog link stays uncustomized while the child customer's existing snapshot is unchanged.
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
	`${chalk.yellowBright("plans.update: propagates an in-place child update into a customerless parent")}`,
	async () => {
		const childCustomerId = "license-in-place-child-propagate-customer";
		const parent = products.base({
			id: "license-in-place-child-propagate-parent",
			items: [items.dashboard()],
		});
		const child = products.base({
			id: "license-in-place-child-propagate-seat",
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
			disable_version: true,
			update_license_parents: [{ plan_id: parent.id, version: 1 }],
		});

		const [childAfter, parentAfter, linkAfter, childCustomer] =
			await Promise.all([
				ProductService.getFull({
					db: ctx.db,
					idOrInternalId: child.id,
					orgId: ctx.org.id,
					env: ctx.env,
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

		expect(childAfter.version).toBe(1);
		expect(parentAfter).toMatchObject({
			version: 1,
			internal_id: before.parentProduct.internal_id,
		});
		expect(linkAfter.planLicense).toMatchObject({
			id: before.planLicense.id,
			customized: false,
		});
		expect(linkAfter.fullLicenseProduct.entitlements).toContainEqual(
			expect.objectContaining({
				feature_id: TestFeature.Words,
				allowance: 50,
			}),
		);
		expect(childCustomer.subscriptions[0]?.plan?.items).not.toContainEqual(
			expect.objectContaining({ feature_id: TestFeature.Words }),
		);
	},
);
