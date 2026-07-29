// Contract: license links reject pooled entitlements from base or customized license items.
// The pooled catalog plan remains valid, and rejection persists no parent-to-license link.

import { expect, test } from "bun:test";
import { type ApiPlanV1, ErrCode } from "@autumn/shared";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils.js";
import { items } from "@tests/utils/fixtures/items.js";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

test.concurrent(
	`${chalk.yellowBright("licenses catalog: links succeed regardless of billing interval")}`,
	async () => {
		const monthlyParent = products.base({
			id: "interval-monthly-parent",
			items: [items.monthlyPrice({ price: 20 })],
		});
		const annualLicense = products.base({
			id: "interval-annual-license",
			items: [items.annualPrice({ price: 200 })],
		});
		const monthlyLicense = products.base({
			id: "interval-monthly-license",
			items: [items.monthlyPrice({ price: 30 })],
		});

		const { autumnV2_2 } = await initScenario({
			customerId: "license-interval-mismatch",
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [monthlyParent, annualLicense, monthlyLicense] }),
			],
			actions: [],
		});

		await autumnV2_2.post("/plans.update", {
			plan_id: monthlyParent.id,
			licenses: [
				{ license_plan_id: annualLicense.id, included: 1 },
				{ license_plan_id: monthlyLicense.id, included: 1 },
			],
		});
		const plan = (await autumnV2_2.post("/plans.get", {
			plan_id: monthlyParent.id,
		})) as ApiPlanV1;

		const list = plan.licenses ?? [];
		expect(list).toHaveLength(2);
		expect(
			list.find((link) => link.license_plan_id === annualLicense.id),
		).toMatchObject({ included: 1 });
		expect(
			list.find((link) => link.license_plan_id === monthlyLicense.id),
		).toMatchObject({ included: 1 });
	},
);

test.concurrent(
	`${chalk.yellowBright("licenses catalog: self-link rejects")}`,
	async () => {
		const parent = products.base({
			id: "self-link-parent",
			items: [items.dashboard()],
		});

		const { autumnV2_2 } = await initScenario({
			customerId: "license-self-link",
			setup: [s.customer({ testClock: false }), s.products({ list: [parent] })],
			actions: [],
		});

		await expectAutumnError({
			errCode: ErrCode.InvalidRequest,
			errMessage: "cannot be linked as a license to itself",
			func: () =>
				autumnV2_2.post("/plans.update", {
					plan_id: parent.id,
					licenses: [{ license_plan_id: parent.id, included: 1 }],
				}),
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("licenses catalog: archived-license link rejects")}`,
	async () => {
		const parent = products.base({
			id: "archived-link-parent",
			items: [items.dashboard()],
		});
		const license = products.base({
			id: "archived-link-license",
			items: [items.monthlyMessages({ includedUsage: 25 })],
		});

		const { autumnV2_2 } = await initScenario({
			customerId: "license-archived-link",
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [parent, license] }),
			],
			actions: [],
		});

		await autumnV2_2.post(`/products/${license.id}`, { archived: true });

		await expectAutumnError({
			errCode: ErrCode.InvalidRequest,
			errMessage: "is archived and cannot be linked",
			func: () =>
				autumnV2_2.post("/plans.update", {
					plan_id: parent.id,
					licenses: [{ license_plan_id: license.id, included: 1 }],
				}),
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("licenses catalog: pooled catalog items cannot be linked as a license")}`,
	async () => {
		const parent = products.base({
			id: "pooled-license-link-parent",
			items: [items.dashboard()],
		});
		const pooledLicense = products.base({
			id: "pooled-license-link-child",
			items: [
				{
					...items.monthlyCredits({ includedUsage: 100 }),
					pooled: true,
				},
			],
		});
		const { autumnV2_2 } = await initScenario({
			customerId: "license-link-rejects-pooled-catalog-item",
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

		const persistedParent = (await autumnV2_2.post("/plans.get", {
			plan_id: parent.id,
		})) as ApiPlanV1;
		expect(persistedParent.licenses ?? []).toHaveLength(0);
	},
);

test.concurrent(
	`${chalk.yellowBright("licenses catalog: pooled customized items cannot be added to a license")}`,
	async () => {
		const parent = products.base({
			id: "pooled-license-custom-parent",
			items: [items.dashboard()],
		});
		const license = products.base({
			id: "pooled-license-custom-child",
			items: [items.monthlyMessages({ includedUsage: 25 })],
		});
		const { autumnV2_2 } = await initScenario({
			customerId: "license-link-rejects-pooled-custom-item",
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [parent, license] }),
			],
			actions: [],
		});

		await expectAutumnError({
			errCode: ErrCode.InvalidRequest,
			errMessage: "Pooled items are not supported for plan licenses",
			func: () =>
				autumnV2_2.post("/plans.update", {
					plan_id: parent.id,
					licenses: [
						{
							license_plan_id: license.id,
							included: 1,
							customize: {
								add_items: [
									{
										...itemsV2.monthlyCredits({ included: 100 }),
										pooled: true,
									},
								],
							},
						},
					],
				}),
		});

		const persistedParent = (await autumnV2_2.post("/plans.get", {
			plan_id: parent.id,
		})) as ApiPlanV1;
		expect(persistedParent.licenses ?? []).toHaveLength(0);
	},
);
