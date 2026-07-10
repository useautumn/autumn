/**
 * Coverage for the license read-path / versioning cleanups:
 *  - A1: versioning a parent to an interval that breaks an existing license
 *    link is rejected AND leaves the product on its old version (no
 *    half-created version persisted).
 *  - B1: /licenses.list_links returns correct per-link customize across a mix
 *    of customized + uncustomized links (the shared deriveCustomizeByLinkId
 *    batching path).
 */

import { expect, test } from "bun:test";
import { BillingInterval, ErrCode } from "@autumn/shared";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils.js";
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
	`${chalk.yellowBright("licenses catalog: versioning a parent to an incompatible interval is rejected and does not create a new version")}`,
	async () => {
		const parent = products.base({
			id: "version-reject-parent",
			items: [items.monthlyPrice({ price: 20 })],
		});
		const license = products.base({
			id: "version-reject-license",
			items: [items.monthlyPrice({ price: 30 })],
		});

		const { customerId, autumnV2_2, ctx } = await initScenario({
			customerId: "license-version-reject",
			setup: [
				s.customer({ paymentMethod: "success", testClock: false }),
				s.products({ list: [parent, license] }),
			],
			actions: [],
		});

		// Compatible monthly ↔ monthly link.
		await autumnV2_2.post("/licenses.link", {
			parent_plan_id: parent.id,
			license_plan_id: license.id,
			included: 1,
		});
		await autumnV2_2.billing.attach({
			customer_id: customerId,
			plan_id: parent.id,
		});

		const parentV1 = await ProductService.getFull({
			db: ctx.db,
			idOrInternalId: parent.id,
			orgId: ctx.org.id,
			env: ctx.env,
		});
		expect(parentV1.version).toBe(1);

		// Versioning the parent to an annual base price would break the interval
		// match with the monthly license — the whole version must be rejected.
		await expectAutumnError({
			errCode: ErrCode.InvalidRequest,
			errMessage: "Billing intervals must match",
			func: () =>
				autumnV2_2.post(`/products/${parent.id}`, {
					price: { amount: 240, interval: BillingInterval.Year },
				}),
		});

		// A1: nothing was persisted — the product is still on version 1 with the
		// same internal_id (no orphaned half-created version).
		const parentAfter = await ProductService.getFull({
			db: ctx.db,
			idOrInternalId: parent.id,
			orgId: ctx.org.id,
			env: ctx.env,
		});
		expect(parentAfter.version).toBe(1);
		expect(parentAfter.internal_id).toBe(parentV1.internal_id);
	},
);

test.concurrent(
	`${chalk.yellowBright("licenses catalog: list_links returns per-link customize for a mix of customized and uncustomized links")}`,
	async () => {
		const parent = products.base({
			id: "list-links-parent",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const customizedLicense = products.base({
			id: "list-links-customized",
			items: [items.monthlyMessages({ includedUsage: 25 })],
		});
		const stockLicense = products.base({
			id: "list-links-stock",
			items: [items.monthlyMessages({ includedUsage: 50 })],
		});

		const { autumnV2_2 } = await initScenario({
			customerId: "license-list-links-mix",
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [parent, customizedLicense, stockLicense] }),
			],
			actions: [s.billing.attach({ productId: parent.id })],
		});

		await autumnV2_2.post("/licenses.link", {
			parent_plan_id: parent.id,
			license_plan_id: customizedLicense.id,
			included: 2,
			customize: { items: [itemsV2.monthlyMessages({ included: 80 })] },
		});
		await autumnV2_2.post("/licenses.link", {
			parent_plan_id: parent.id,
			license_plan_id: stockLicense.id,
			included: 3,
		});

		const { list } = (await autumnV2_2.post("/licenses.list_links", {
			parent_plan_id: parent.id,
		})) as { list: PlanLicenseRow[] };
		expect(list).toHaveLength(2);

		const customized = list.find(
			(row) => row.license_plan_id === customizedLicense.id,
		);
		const stock = list.find((row) => row.license_plan_id === stockLicense.id);

		// Customized link carries its derived customize; stock link has none.
		expect(customized).toMatchObject({ included: 2 });
		expect(customized?.customize?.add_items?.[0].included).toBe(80);
		expect(stock).toMatchObject({ included: 3 });
		expect(stock?.customize ?? null).toBeNull();
	},
);
