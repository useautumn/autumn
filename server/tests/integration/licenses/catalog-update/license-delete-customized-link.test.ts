/**
 * TDD test: deleting a license that a customer customized.
 *
 * Red-failure mode (pre-fix): the delete guard only sees catalog
 * (is_custom = false) links, so the customer-customized link's
 * license_entitlements rows hit the raw
 * "license_entitlements_entitlement_fkey" RESTRICT error; the customized
 * rows also survive customer deletion, so the license stays undeletable.
 * The org wipe behind sandbox reset (ProductService.safeDeleteByOrgId)
 * fails the same way.
 *
 * Green-success criteria (post-fix): license delete is blocked with the
 * clean "linked to a parent plan" error while any link exists; deleting
 * the customer cascades its customized link rows away; after the parent
 * is deleted the license deletes cleanly; and safeDeleteByOrgId wipes an
 * org holding a customized link without an FK error.
 */

import { expect, test } from "bun:test";
import {
	AppEnv,
	type AttachParamsV1Input,
	entitlements,
	licenseEntitlements,
	organizations,
	planLicenses,
	products,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2.js";
import { products as productFixtures } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { and, eq } from "drizzle-orm";
import { ProductService } from "@/internal/products/ProductService.js";

test.concurrent(
	`${chalk.yellowBright("licenses-delete: customer-customized license blocks cleanly, customer delete cascades the link, then license deletes")}`,
	async () => {
		const suffix = Math.random().toString(36).slice(2, 9);
		const customerId = `license-delete-custom-${suffix}`;
		const parent = productFixtures.base({
			id: `delete-custom-parent-${suffix}`,
			items: [items.dashboard()],
		});
		const license = productFixtures.base({
			id: `delete-custom-license-${suffix}`,
			items: [items.monthlyMessages({ includedUsage: 25 })],
		});

		const { autumnV1, autumnV2_2, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [parent, license] }),
			],
			actions: [
				s.licenses.link({
					parentProductId: parent.id,
					licenseProductId: license.id,
					included: 1,
				}),
			],
		});

		await autumnV2_2.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: parent.id,
			customize: {
				upsert_licenses: [
					{
						license_plan_id: license.id,
						customize: {
							add_items: [itemsV2.monthlyWords({ included: 100 })],
						},
					},
				],
			},
		});

		const licenseProduct = await ctx.db.query.products.findFirst({
			where: and(
				eq(products.id, license.id),
				eq(products.org_id, ctx.org.id),
				eq(products.env, ctx.env),
			),
		});
		if (!licenseProduct) throw new Error("License product not found");

		const linksForLicense = () =>
			ctx.db.query.planLicenses.findMany({
				where: eq(
					planLicenses.license_internal_product_id,
					licenseProduct.internal_id,
				),
			});

		const customLinks = (await linksForLicense()).filter(
			(link) => link.is_custom,
		);
		expect(customLinks.length).toBeGreaterThan(0);
		const junctionRows = await ctx.db.query.licenseEntitlements.findMany({
			where: eq(licenseEntitlements.plan_license_id, customLinks[0].id),
		});
		expect(junctionRows.length).toBeGreaterThan(0);

		// Blocked cleanly, not with the raw FK error.
		await expect(autumnV2_2.delete(`/products/${license.id}`)).rejects.toThrow(
			"is linked to a parent plan",
		);

		// Deleting the customer cascades its customized link away; the
		// catalog link (owned by the parent plan) stays.
		await autumnV1.customers.delete(customerId);
		const afterCustomerDelete = await linksForLicense();
		expect(afterCustomerDelete.filter((link) => link.is_custom)).toHaveLength(
			0,
		);
		expect(afterCustomerDelete.filter((link) => !link.is_custom)).toHaveLength(
			1,
		);

		// Parent next, then the license itself deletes without an FK error.
		await autumnV2_2.delete(`/products/${parent.id}`);
		const deletion = (await autumnV2_2.delete(`/products/${license.id}`)) as {
			success: boolean;
		};
		expect(deletion.success).toBe(true);
	},
);

test.concurrent(
	`${chalk.yellowBright("licenses-delete: catalogV2 removes parent and customized license in one call, license first")}`,
	async () => {
		const suffix = Math.random().toString(36).slice(2, 9);
		const parent = productFixtures.base({
			id: `delete-cv2-parent-${suffix}`,
			items: [items.dashboard()],
		});
		const license = productFixtures.base({
			id: `delete-cv2-license-${suffix}`,
			items: [items.monthlyMessages({ includedUsage: 25 })],
		});

		const { autumnV2_2, autumnV2_3, ctx } = await initScenario({
			customerId: `license-delete-cv2-${suffix}`,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [parent, license] }),
			],
			actions: [],
		});

		await autumnV2_2.post("/plans.update", {
			plan_id: parent.id,
			licenses: [
				{
					license_plan_id: license.id,
					included: 1,
					customize: {
						add_items: [itemsV2.monthlyWords({ included: 100 })],
					},
				},
			],
		});

		// Pre-fix: FK 500 when the license row is deleted before its parent.
		await autumnV2_3.catalogV2.update({
			remove_plans: [{ plan_id: license.id }, { plan_id: parent.id }],
		});

		const remaining = await ctx.db.query.products.findMany({
			where: and(eq(products.org_id, ctx.org.id), eq(products.env, ctx.env)),
		});
		expect(
			remaining.some(
				(product) => product.id === license.id || product.id === parent.id,
			),
		).toBe(false);
	},
);

test.concurrent(
	`${chalk.yellowBright("licenses-delete: safeDeleteByOrgId wipes an org holding a customized link")}`,
	async () => {
		const suffix = Math.random().toString(36).slice(2, 9);
		const fakeOrgId = `org_license_wipe_${suffix}`;
		const { ctx } = await initScenario({
			customerId: `license-wipe-${suffix}`,
			setup: [s.customer({ testClock: false })],
			actions: [],
		});
		const db = ctx.db;
		const now = Date.now();
		const parentInternalId = `prod_parent_${suffix}`;
		const licenseInternalId = `prod_license_${suffix}`;
		const entitlementId = `ent_${suffix}`;
		const planLicenseId = `plan_lic_${suffix}`;
		const messagesFeature = ctx.features.find(
			(feature) => feature.id === TestFeature.Messages,
		);
		if (!messagesFeature) throw new Error("Messages feature not found");

		try {
			await db.insert(organizations).values({
				id: fakeOrgId,
				slug: fakeOrgId,
				name: fakeOrgId,
				createdAt: new Date(),
			});
			// License first: batchSize 1 below deletes it before its parent,
			// the order that hits the FK when the batches don't coincide.
			await db.insert(products).values([
				{
					internal_id: licenseInternalId,
					id: `wipe-license-${suffix}`,
					org_id: fakeOrgId,
					env: AppEnv.Sandbox,
					name: "Wipe License",
				},
				{
					internal_id: parentInternalId,
					id: `wipe-parent-${suffix}`,
					org_id: fakeOrgId,
					env: AppEnv.Sandbox,
					name: "Wipe Parent",
				},
			]);
			await db.insert(entitlements).values({
				id: entitlementId,
				created_at: now,
				internal_feature_id: messagesFeature.internal_id,
				internal_product_id: licenseInternalId,
				org_id: fakeOrgId,
				feature_id: TestFeature.Messages,
			});
			await db.insert(planLicenses).values({
				id: planLicenseId,
				parent_internal_product_id: parentInternalId,
				license_internal_product_id: licenseInternalId,
				is_custom: false,
				customized: true,
				included: 1,
			});
			await db.insert(licenseEntitlements).values({
				id: `lic_ent_${suffix}`,
				plan_license_id: planLicenseId,
				entitlement_id: entitlementId,
				created_at: now,
			});

			// Pre-fix: throws license_entitlements_entitlement_fkey.
			await ProductService.safeDeleteByOrgId({
				db,
				orgId: fakeOrgId,
				env: AppEnv.Sandbox,
				batchSize: 1,
			});

			const remainingProducts = await db.query.products.findMany({
				where: eq(products.org_id, fakeOrgId),
			});
			expect(remainingProducts).toHaveLength(0);
			const remainingLinks = await db.query.planLicenses.findMany({
				where: eq(planLicenses.id, planLicenseId),
			});
			expect(remainingLinks).toHaveLength(0);
		} finally {
			await db.delete(organizations).where(eq(organizations.id, fakeOrgId));
		}
	},
);
