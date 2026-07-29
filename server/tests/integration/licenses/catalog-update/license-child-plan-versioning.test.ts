import { expect, test } from "bun:test";
import type { ApiPlanV1, CheckResponseV3 } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import type { AutumnInt } from "@/external/autumn/autumnCli.js";
import { listLicenseLinks } from "../licenseTestUtils.js";

const assignedGrant = async ({
	autumn,
	customerId,
	entityId,
	licensePlanId,
}: {
	autumn: AutumnInt;
	customerId: string;
	entityId: string;
	licensePlanId: string;
}) => {
	await autumn.post("/licenses.attach", {
		customer_id: customerId,
		plan_id: licensePlanId,
		entities: [{ entity_id: entityId }],
	});
	const check = await autumn.check<CheckResponseV3>({
		customer_id: customerId,
		entity_id: entityId,
		feature_id: TestFeature.Messages,
	});
	return { granted: check.balance?.granted };
};

const getPlanVersion = async ({
	autumn,
	planId,
}: {
	autumn: AutumnInt;
	planId: string;
}) => {
	const plan = (await autumn.post("/plans.get", {
		plan_id: planId,
	})) as ApiPlanV1;
	return plan.version;
};

test.concurrent(
	`${chalk.yellowBright("licenses child-versioning: no assignments edits in place, parent customers alone never version a license")}`,
	async () => {
		const customerId = "license-child-inplace";
		const parent = products.base({
			id: "child-inplace-parent",
			items: [items.dashboard()],
		});
		const license = products.base({
			id: "child-inplace-seat",
			items: [items.monthlyMessages({ includedUsage: 25 })],
		});

		const { entities, autumnV2_2 } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.entities({ count: 1, featureId: TestFeature.Users }),
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
		// return;

		// ── Contract: in-place edit, no new version ─────────────────────────
		await autumnV2_2.post("/plans.update", {
			plan_id: license.id,
			items: [itemsV2.monthlyMessages({ included: 50 })],
		});
		expect(
			await getPlanVersion({ autumn: autumnV2_2, planId: license.id }),
		).toBe(1);

		// ── Contract: the parent link is untouched ──────────────────────────
		const links = await listLicenseLinks({
			autumn: autumnV2_2,
			parentPlanId: parent.id,
		});
		expect(links).toHaveLength(1);
		expect(links[0]).toMatchObject({
			license_plan_id: license.id,
			included: 2,
		});

		// The existing customer pool retains its original definition.
		const { granted } = await assignedGrant({
			autumn: autumnV2_2,
			customerId,
			entityId: entities[0].id,
			licensePlanId: license.id,
		});
		expect(granted).toBe(25);
	},
);

test.concurrent(
	`${chalk.yellowBright("licenses child-versioning: active assignments version the license and preserve the customer pool")}`,
	async () => {
		const customerId = "license-child-version-pin";
		const parent = products.base({
			id: "child-version-parent",
			items: [items.dashboard()],
		});
		const license = products.base({
			id: "child-version-seat",
			items: [items.monthlyMessages({ includedUsage: 25 })],
		});

		const { entities, autumnV2_2 } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
				s.products({ list: [parent, license] }),
			],
			actions: [
				s.licenses.link({
					parentProductId: parent.id,
					licenseProductId: license.id,
					included: 2,
				}),
				s.billing.attach({ productId: parent.id }),
				s.licenses.assign({ licenseProductId: license.id, entityIndex: 0 }),
			],
		});

		// ── Contract: default update with active assignments -> new version ─
		await autumnV2_2.post("/plans.update", {
			plan_id: license.id,
			items: [itemsV2.monthlyMessages({ included: 50 })],
		});
		expect(
			await getPlanVersion({ autumn: autumnV2_2, planId: license.id }),
		).toBe(2);

		// The existing customer pool remains on its v1 definition.
		const { granted } = await assignedGrant({
			autumn: autumnV2_2,
			customerId,
			entityId: entities[1].id,
			licensePlanId: license.id,
		});
		expect(granted).toBe(25);

		// ── Contract: existing assignment keeps its grant ────────────────────
		const existingCheck = await autumnV2_2.check<CheckResponseV3>({
			customer_id: customerId,
			entity_id: entities[0].id,
			feature_id: TestFeature.Messages,
		});
		expect(existingCheck.balance?.granted).toBe(25);
	},
);

test.concurrent(
	`${chalk.yellowBright("licenses child-versioning: disable_version edits in place with active assignments")}`,
	async () => {
		const customerId = "license-child-disable-version";
		const parent = products.base({
			id: "child-disable-parent",
			items: [items.dashboard()],
		});
		const license = products.base({
			id: "child-disable-seat",
			items: [items.monthlyMessages({ includedUsage: 25 })],
		});

		const { entities, autumnV2_2 } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
				s.products({ list: [parent, license] }),
			],
			actions: [
				s.licenses.link({
					parentProductId: parent.id,
					licenseProductId: license.id,
					included: 2,
				}),
				s.billing.attach({ productId: parent.id }),
				s.licenses.assign({ licenseProductId: license.id, entityIndex: 0 }),
			],
		});

		// ── Contract: disable_version -> in place, no new version ───────────
		await autumnV2_2.post("/plans.update", {
			plan_id: license.id,
			items: [itemsV2.monthlyMessages({ included: 50 })],
			disable_version: true,
		});
		expect(
			await getPlanVersion({ autumn: autumnV2_2, planId: license.id }),
		).toBe(1);

		// ── Contract: existing assignment's grant is untouched ──────────────
		const existingCheck = await autumnV2_2.check<CheckResponseV3>({
			customer_id: customerId,
			entity_id: entities[0].id,
			feature_id: TestFeature.Messages,
		});
		expect(existingCheck.balance?.granted).toBe(25);

		// The existing customer pool retains its original definition.
		const { granted } = await assignedGrant({
			autumn: autumnV2_2,
			customerId,
			entityId: entities[1].id,
			licensePlanId: license.id,
		});
		expect(granted).toBe(25);
	},
);
