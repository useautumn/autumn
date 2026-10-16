import { expect, test } from "bun:test";
import {
	customerEntitlements,
	entitlements,
	licenseEntitlements,
	planLicenses,
	products,
} from "@autumn/shared";
import { items } from "@tests/utils/fixtures/items.js";
import { products as productFixtures } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { and, eq, inArray } from "drizzle-orm";
import { licenseItemRepo } from "@/internal/licenses/repos/licenseItemRepo.js";
import { generateId } from "@/utils/genUtils.js";

test.concurrent(
	`${chalk.yellowBright("licenses sweep: deletes only custom entitlements no license or customer references")}`,
	async () => {
		const suffix = Math.random().toString(36).slice(2, 9);
		const customerId = `license-sweep-custom-${suffix}`;
		const parent = productFixtures.base({
			id: `sweep-custom-parent-${suffix}`,
			items: [items.dashboard()],
		});
		const license = productFixtures.base({
			id: `sweep-custom-license-${suffix}`,
			items: [items.monthlyMessages({ includedUsage: 25 })],
		});

		const { ctx } = await initScenario({
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
				s.billing.attach({ productId: parent.id }),
			],
		});
		const { db } = ctx;

		const licenseProduct = await db.query.products.findFirst({
			where: and(
				eq(products.id, license.id),
				eq(products.org_id, ctx.org.id),
				eq(products.env, ctx.env),
			),
		});
		if (!licenseProduct) throw new Error("License product not found");
		const link = await db.query.planLicenses.findFirst({
			where: eq(
				planLicenses.license_internal_product_id,
				licenseProduct.internal_id,
			),
		});
		const baseEntitlement = await db.query.entitlements.findFirst({
			where: eq(entitlements.internal_product_id, licenseProduct.internal_id),
		});
		const customerEntitlement = await db.query.customerEntitlements.findFirst({
			where: eq(customerEntitlements.customer_id, customerId),
		});
		if (!link || !baseEntitlement || !customerEntitlement) {
			throw new Error("Scenario rows not found");
		}

		const customCopy = (label: string) => ({
			...baseEntitlement,
			id: `ent_sweep_${label}_${suffix}`,
			is_custom: true,
		});
		const unreferenced = customCopy("unreferenced");
		const licenseReferenced = customCopy("license_ref");
		const customerReferenced = customCopy("customer_ref");
		await db
			.insert(entitlements)
			.values([unreferenced, licenseReferenced, customerReferenced]);

		const licenseRefId = generateId("lic_ent");
		await db.insert(licenseEntitlements).values({
			id: licenseRefId,
			plan_license_id: link.id,
			entitlement_id: licenseReferenced.id,
			created_at: Date.now(),
		});
		const customerRefId = generateId("cus_ent");
		await db.insert(customerEntitlements).values({
			...customerEntitlement,
			id: customerRefId,
			entitlement_id: customerReferenced.id,
		});

		const candidateIds = [
			unreferenced.id,
			licenseReferenced.id,
			customerReferenced.id,
			baseEntitlement.id,
		];
		const remainingIds = async () =>
			(
				await db
					.select({ id: entitlements.id })
					.from(entitlements)
					.where(inArray(entitlements.id, candidateIds))
			)
				.map((row) => row.id)
				.sort();

		await licenseItemRepo.sweepUnreferencedCustomRows({
			db,
			entitlementIds: candidateIds,
			priceIds: [],
		});
		expect(await remainingIds()).toEqual(
			[licenseReferenced.id, customerReferenced.id, baseEntitlement.id].sort(),
		);

		// With their references gone, the custom rows sweep; the catalog row never does.
		await db
			.delete(licenseEntitlements)
			.where(eq(licenseEntitlements.id, licenseRefId));
		await db
			.delete(customerEntitlements)
			.where(eq(customerEntitlements.id, customerRefId));
		await licenseItemRepo.sweepUnreferencedCustomRows({
			db,
			entitlementIds: candidateIds,
			priceIds: [],
		});
		expect(await remainingIds()).toEqual([baseEntitlement.id]);
	},
);
