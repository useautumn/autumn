// Contract: a plan used as a license rejects pooled items at the point they are added,
// so parents linking to it stay versionable instead of failing on an unrelated edit.

import { expect, test } from "bun:test";
import { type ApiPlanV1, ErrCode, entitlements } from "@autumn/shared";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils.js";
import { items } from "@tests/utils/fixtures/items.js";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { eq } from "drizzle-orm";
import { ProductService } from "@/internal/products/ProductService.js";

test.concurrent(
	`${chalk.yellowBright("licenses: adding a pooled item to a linked license plan rejects, leaving the parent versionable")}`,
	async () => {
		const parent = products.base({
			id: "pooled-version-regression-parent",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const license = products.base({
			id: "pooled-version-regression-child",
			items: [items.monthlyMessages({ includedUsage: 25 })],
		});

		const { autumnV2_2, ctx } = await initScenario({
			customerId: "license-version-pooled-regression",
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

		await expectAutumnError({
			errCode: ErrCode.InvalidRequest,
			errMessage: "Pooled items are not supported for plan licenses",
			func: () =>
				autumnV2_2.post("/plans.update", {
					plan_id: license.id,
					force_version: true,
					items: [
						{
							...itemsV2.monthlyCredits({ included: 100 }),
							pooled: true,
						},
					],
				}),
		});

		const licenseAfter = await ProductService.getFull({
			db: ctx.db,
			idOrInternalId: license.id,
			orgId: ctx.org.id,
			env: ctx.env,
		});
		expect(licenseAfter.version).toBe(1);
		expect(
			licenseAfter.entitlements.some((entitlement) => entitlement.pooled),
		).toBe(false);

		await autumnV2_2.post(`/products/${parent.id}`, {
			items: [items.monthlyMessages({ includedUsage: 200 })],
		});

		const parentV2 = (await autumnV2_2.post("/plans.get", {
			plan_id: parent.id,
		})) as ApiPlanV1;
		expect(parentV2.version).toBe(2);
		expect(parentV2.licenses ?? []).toHaveLength(1);
		expect((parentV2.licenses ?? [])[0]).toMatchObject({
			license_plan_id: license.id,
			included: 1,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("licenses: a linked license plan already carrying a pooled item stays editable")}`,
	async () => {
		const parent = products.base({
			id: "pooled-legacy-editable-parent",
			items: [items.dashboard()],
		});
		const license = products.base({
			id: "pooled-legacy-editable-child",
			items: [items.monthlyMessages({ includedUsage: 25 })],
		});

		const { autumnV2_2, ctx } = await initScenario({
			customerId: "license-legacy-pooled-editable",
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

		// Legacy state: pooled + linked, which the guards now prevent via the API.
		const licenseBefore = await ProductService.getFull({
			db: ctx.db,
			idOrInternalId: license.id,
			orgId: ctx.org.id,
			env: ctx.env,
		});
		await ctx.db
			.update(entitlements)
			.set({ pooled: true })
			.where(eq(entitlements.internal_product_id, licenseBefore.internal_id));

		await autumnV2_2.post("/plans.update", {
			plan_id: license.id,
			name: "Renamed legacy license",
		});

		const renamed = (await autumnV2_2.post("/plans.get", {
			plan_id: license.id,
		})) as ApiPlanV1;
		expect(renamed.name).toBe("Renamed legacy license");

		await expectAutumnError({
			errCode: ErrCode.InvalidRequest,
			errMessage: "Pooled items are not supported for plan licenses",
			func: () =>
				autumnV2_2.post("/plans.update", {
					plan_id: license.id,
					items: [
						{ ...itemsV2.monthlyCredits({ included: 100 }), pooled: true },
					],
				}),
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("licenses: linking a license whose pinned version is pooled still rejects")}`,
	async () => {
		const parent = products.base({
			id: "pooled-version-still-rejects-parent",
			items: [items.dashboard()],
		});
		const pooledLicense = products.base({
			id: "pooled-version-still-rejects-child",
			items: [
				{
					...items.monthlyCredits({ includedUsage: 100 }),
					pooled: true,
				},
			],
		});

		const { autumnV2_2 } = await initScenario({
			customerId: "license-version-pooled-still-rejects",
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [parent, pooledLicense] }),
			],
			actions: [],
		});

		await expectAutumnError({
			errCode: ErrCode.InvalidRequest,
			errMessage: "Pooled items are not supported for plan licenses",
			func: () =>
				autumnV2_2.post("/plans.update", {
					plan_id: parent.id,
					licenses: [{ license_plan_id: pooledLicense.id, included: 1 }],
				}),
		});
	},
);
