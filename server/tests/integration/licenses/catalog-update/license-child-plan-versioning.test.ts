/**
 * TDD test for updating a license (child) plan directly, as a normal plan.
 *
 * Contract under test:
 *   New types/fields:
 *     - licenses[].version?: number on plans.update — pin the link to a
 *       specific version of the license plan; omitted keeps the existing pin.
 *   New behaviors:
 *     - plans.update on a license with no assignments -> in-place edit: the
 *       license stays v1, the parent link is untouched, future assignments
 *       mint the new items. Parent customers alone never version a license.
 *     - plans.update on a license with active assignments (default) -> the
 *       license versions to v2, but the parent link stays pinned to v1: new
 *       assignments still mint v1 items (grandfathered until re-linked).
 *     - plans.update on a license with active assignments + disable_version ->
 *       in-place: stays v1, existing assignment grants untouched, new
 *       assignments mint the new items.
 *     - plans.update on the parent with licenses[{license_plan_id, version: N}]
 *       -> repoints the link to version N; new assignments mint vN items.
 *       Re-linking while the old version has active assignments is rejected
 *       (unassign first) — assignments must never be silently stranded.
 *
 * Pre-impl red: licenses[].version did not exist (link resolution ignored it).
 * Post-impl green: resolveLink pins entry.version when provided; everything
 *   else rides the standard plan update/versioning machinery.
 */

import { expect, test } from "bun:test";
import type { ApiPlanV1, CheckResponseV3 } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils.js";
import { items } from "@tests/utils/fixtures/items.js";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import type { AutumnInt } from "@/external/autumn/autumnCli.js";
import { assignLicense, listLicenseLinks } from "../licenseTestUtils.js";

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
	const assignment = await assignLicense({
		autumn,
		customerId,
		entityId,
		licensePlanId,
	});
	const check = await autumn.check<CheckResponseV3>({
		customer_id: customerId,
		entity_id: entityId,
		feature_id: TestFeature.Messages,
	});
	return { granted: check.balance?.granted, assignmentId: assignment.id };
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

		// ── Contract: future assignments mint the new items ─────────────────
		const { granted } = await assignedGrant({
			autumn: autumnV2_2,
			customerId,
			entityId: entities[0].id,
			licensePlanId: license.id,
		});
		expect(granted).toBe(50);
	},
);

test.concurrent(
	`${chalk.yellowBright("licenses child-versioning: active assignments version the license, parent link stays pinned to v1")}`,
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

		// ── Contract: parent link still pins v1 — new assignments mint v1 ───
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

		// ── Contract: new assignments mint the new items ─────────────────────
		const { granted } = await assignedGrant({
			autumn: autumnV2_2,
			customerId,
			entityId: entities[1].id,
			licensePlanId: license.id,
		});
		expect(granted).toBe(50);
	},
);

test.concurrent(
	`${chalk.yellowBright("licenses child-versioning: licenses[].version re-links the parent to a chosen license version")}`,
	async () => {
		const customerId = "license-child-relink";
		const parent = products.base({
			id: "child-relink-parent",
			items: [items.dashboard()],
		});
		const license = products.base({
			id: "child-relink-seat",
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
			],
		});

		// Mint license v2 without assignments via force_version.
		await autumnV2_2.post("/plans.update", {
			plan_id: license.id,
			items: [itemsV2.monthlyMessages({ included: 50 })],
			force_version: true,
		});
		expect(
			await getPlanVersion({ autumn: autumnV2_2, planId: license.id }),
		).toBe(2);

		// ── Contract: link still pins v1 until explicitly re-linked ─────────
		const beforeRelink = await assignedGrant({
			autumn: autumnV2_2,
			customerId,
			entityId: entities[0].id,
			licensePlanId: license.id,
		});
		expect(beforeRelink.granted).toBe(25);

		// ── Contract: re-linking over an active assignment is rejected ───────
		await expectAutumnError({
			errMessage: "active assignments",
			func: () =>
				autumnV2_2.post("/plans.update", {
					plan_id: parent.id,
					licenses: [{ license_plan_id: license.id, included: 2, version: 2 }],
				}),
		});

		// ── Contract: unassign, then licenses[].version repoints the link ────
		await autumnV2_2.post("/licenses.release", {
			customer_id: customerId,
			entity_ids: [entities[0].id],
			license_plan_id: license.id,
		});
		await autumnV2_2.post("/plans.update", {
			plan_id: parent.id,
			licenses: [{ license_plan_id: license.id, included: 2, version: 2 }],
		});
		const afterRelink = await assignedGrant({
			autumn: autumnV2_2,
			customerId,
			entityId: entities[1].id,
			licensePlanId: license.id,
		});
		expect(afterRelink.granted).toBe(50);
	},
);
