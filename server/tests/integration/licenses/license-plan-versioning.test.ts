/**
 * TDD test for plan versioning silently dropping plan license links.
 *
 * Red-failure mode (current behavior):
 *  - handleVersionProductV2 copies entitlements/prices/free-trials to the new
 *    version's internal_id but never plan_license rows, so after versioning
 *    licenses.list_links for the parent plan returns [].
 *
 * Green-success criteria (after fix):
 *  - Versioning a parent plan carries its plan license links forward;
 *    list_links still returns the license with the same
 *    included and customize after the new version is created.
 */

import { expect, test } from "bun:test";
import { items } from "@tests/utils/fixtures/items.js";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { ProductService } from "@/internal/products/ProductService.js";

type PlanLicenseRow = {
	parent_plan_id: string;
	license_plan_id: string;
	included: number;
	customize?: { add_items?: Array<{ included?: number }> } | null;
};

test.concurrent(
	`${chalk.yellowBright("licenses: versioning a parent plan keeps its plan license links")}`,
	async () => {
		const parent = products.base({
			id: "license-version-parent",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const license = {
			...products.base({
				id: "license-version-seat",
				items: [items.monthlyMessages({ includedUsage: 25 })],
			}),
		};

		const { autumnV2_2, ctx } = await initScenario({
			customerId: "license-plan-versioning",
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [parent, license] }),
			],
			actions: [s.billing.attach({ productId: parent.id })],
		});

		await autumnV2_2.post("/licenses.link", {
			parent_plan_id: parent.id,
			license_plan_id: license.id,
			included: 1,
			customize: {
				items: [itemsV2.monthlyMessages({ included: 100 })],
			},
		});

		const { list: beforeVersioning } = (await autumnV2_2.post(
			"/licenses.list_links",
			{ parent_plan_id: parent.id },
		)) as { list: PlanLicenseRow[] };
		expect(beforeVersioning).toHaveLength(1);

		const parentV1 = await ProductService.getFull({
			db: ctx.db,
			idOrInternalId: parent.id,
			orgId: ctx.org.id,
			env: ctx.env,
		});

		await autumnV2_2.post(`/products/${parent.id}`, {
			items: [items.monthlyMessages({ includedUsage: 200 })],
		});

		const parentV2 = await ProductService.getFull({
			db: ctx.db,
			idOrInternalId: parent.id,
			orgId: ctx.org.id,
			env: ctx.env,
		});
		expect(parentV2.version).toBe(2);
		expect(parentV2.internal_id).not.toBe(parentV1.internal_id);

		const { list: afterVersioning } = (await autumnV2_2.post(
			"/licenses.list_links",
			{ parent_plan_id: parent.id },
		)) as { list: PlanLicenseRow[] };
		expect(afterVersioning).toHaveLength(1);
		expect(afterVersioning[0]).toMatchObject({
			parent_plan_id: parent.id,
			license_plan_id: license.id,
			included: 1,
		});
		expect(afterVersioning[0].customize?.add_items?.[0].included).toBe(100);
	},
);
