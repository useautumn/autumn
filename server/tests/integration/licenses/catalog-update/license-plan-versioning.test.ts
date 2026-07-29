import { expect, test } from "bun:test";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { ProductService } from "@/internal/products/ProductService.js";
import { listLicenseLinks } from "../licenseTestUtils.js";

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
			actions: [
				s.licenses.link({
					parentProductId: parent.id,
					licenseProductId: license.id,
					included: 1,
				}),
				s.billing.attach({ productId: parent.id }),
			],
		});

		const beforeVersioning = await listLicenseLinks({
			autumn: autumnV2_2,
			parentPlanId: parent.id,
		});
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

		const afterVersioning = await listLicenseLinks({
			autumn: autumnV2_2,
			parentPlanId: parent.id,
		});
		expect(afterVersioning).toHaveLength(1);
		expect(afterVersioning[0]).toMatchObject({
			license_plan_id: license.id,
			included: 1,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("licenses: combined item and explicit license update leaves old links unchanged")}`,
	async () => {
		const parent = products.base({
			id: "license-combined-version-parent",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const license = products.base({
			id: "license-combined-version-child",
			items: [items.monthlyMessages({ includedUsage: 25 })],
		});
		const { autumnV2_2, ctx } = await initScenario({
			customerId: "license-combined-version",
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [parent, license] }),
			],
			actions: [
				s.licenses.link({
					parentProductId: parent.id,
					licenseProductId: license.id,
					included: 2,
				}),
				s.billing.attach({ productId: parent.id }),
			],
		});
		const v1 = await ProductService.getFull({
			db: ctx.db,
			idOrInternalId: parent.id,
			orgId: ctx.org.id,
			env: ctx.env,
		});
		await expect(
			autumnV2_2.post("/plans.update", {
				plan_id: parent.id,
				all_versions: true,
				licenses: [],
			}),
		).rejects.toThrow("Updating licenses across all plan versions");
		await expect(
			autumnV2_2.post("/catalog.preview_update", {
				plans: [{ plan_id: parent.id, all_versions: true, licenses: [] }],
			}),
		).rejects.toThrow("Updating licenses across all plan versions");

		await autumnV2_2.post("/plans.update", {
			plan_id: parent.id,
			items: [
				{
					feature_id: TestFeature.Messages,
					included: 200,
					reset: { interval: "month" },
				},
			],
			licenses: [],
		});

		const v2 = await ProductService.getFull({
			db: ctx.db,
			idOrInternalId: parent.id,
			orgId: ctx.org.id,
			env: ctx.env,
		});
		const old = await ProductService.getFull({
			db: ctx.db,
			idOrInternalId: parent.id,
			orgId: ctx.org.id,
			env: ctx.env,
			version: 1,
		});
		expect(v2.version).toBe(2);
		expect(v2.licenses).toHaveLength(0);
		expect(old.licenses?.map((link) => link.product.id)).toEqual([license.id]);
		expect(old.internal_id).toBe(v1.internal_id);
	},
);
