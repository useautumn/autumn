/**
 * TDD test for plans.preview_update 500ing after a license customize is
 * versioned.
 *
 * Red-failure mode (current behavior):
 *  - Customize a license link, save with force_version so v2 is created, then
 *    call plans.preview_update on the parent. The preview diffs v2 against v1,
 *    producing a customize that carries `upsert_licenses`. That field is
 *    declared on DiffedCustomizePlanV1 (the type) but omitted from
 *    DiffedCustomizePlanV1Schema, which is .strict() — so the request 500s with
 *    `customize: Unrecognized key: "upsert_licenses"`.
 *
 * Green-success criteria (after fix):
 *  - preview_update resolves, and the license change is visible in the preview
 *    rather than rejected at the schema boundary.
 */
import { expect, test } from "bun:test";
import { setupLicenseUpdateScenario } from "@tests/integration/licenses/billing/update/setupLicenseUpdateScenario";
import { items } from "@tests/utils/fixtures/items";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import chalk from "chalk";

test(
	`${chalk.yellowBright("plans.preview_update: survives a versioned license customize")}`,
	async () => {
		const customerId = "preview-upsert-licenses";
		const idPrefix = "prev-upsert";

		const scenario = await setupLicenseUpdateScenario({
			customerId,
			idPrefix,
			seatPrice: 20,
			seatItems: [items.monthlyMessages({ includedUsage: 500 })],
			includedSeats: 1,
			attachedSeats: 3,
		});
		await scenario.assignSeats({ count: 2 });

		const { autumnV2_2, parent, devSeat } = scenario;

		// Step 1: customize the license and cut a new version — the dashboard's
		// "Create new version" + "Apply & migrate" path.
		await autumnV2_2.post("/plans.update", {
			plan_id: parent.id,
			force_version: true,
			licenses: [
				{
					license_plan_id: devSeat.id,
					included: 1,
					customize: { add_items: [itemsV2.dashboard()] },
				},
			],
		});

		// Step 2: the dashboard fires preview_update as you edit the versioned
		// plan. This is the call that 500s in the browser.
		const preview = await autumnV2_2.post("/plans.preview_update", {
			plan_id: parent.id,
			include_versions: true,
			include_variants: true,
			include_license_parents: true,
		});

		expect(preview).toBeDefined();
	},
	{ timeout: 180_000 },
);
