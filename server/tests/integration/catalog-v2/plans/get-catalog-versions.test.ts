/**
 * catalogV2.get — `include_versions` returns every non-archived version row,
 * not only the active one.
 *
 * Contract:
 *   create v1 (version_slug "v1") -> response echoes a string internal_id
 *   mint v2 via an unmatched version_slug -> new internal_id, becomes active
 *   catalogV2.get({}) -> one row: v2, active
 *   catalogV2.get({ include_versions: true }) -> two rows: v2 active, v1 not
 */

import { expect, test } from "bun:test";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { uniqueTestId } from "../utils/uniqueTestId.js";

test.concurrent(
	`${chalk.yellowBright("catalogV2 get include_versions: every non-archived version, not only the active one")}`,
	async () => {
		const { autumnV2_3 } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_get_versions");

		try {
			const v1Response = await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						name: "V1",
						version_slug: "v1",
						price: { amount: 10, interval: "month" },
					},
				],
			});
			const v1Plan = v1Response.plans[0];
			expect(typeof v1Plan.internal_id).toBe("string");
			expect(v1Plan.version_slug).toBe("v1");

			const v2Response = await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						name: "V2",
						version_slug: "v2",
						price: { amount: 20, interval: "month" },
					},
				],
			});
			const v2Plan = v2Response.plans[0];
			expect(typeof v2Plan.internal_id).toBe("string");
			expect(v2Plan.internal_id).not.toBe(v1Plan.internal_id);

			const activeOnly = await autumnV2_3.catalogV2.get({});
			const activeRows = activeOnly.plans.filter((plan) => plan.id === planId);
			expect(activeRows).toHaveLength(1);
			expect(activeRows[0].active).toBe(true);
			expect(activeRows[0].version_slug).toBe("v2");

			const allVersions = await autumnV2_3.catalogV2.get({
				include_versions: true,
			});
			const versionRows = allVersions.plans.filter(
				(plan) => plan.id === planId,
			);
			expect(versionRows).toHaveLength(2);

			const v2Row = versionRows.find((plan) => plan.version_slug === "v2");
			const v1Row = versionRows.find((plan) => plan.version_slug === "v1");
			expect(v2Row?.active).toBe(true);
			expect(v1Row?.active).toBe(false);
			expect(typeof v2Row?.internal_id).toBe("string");
			expect(typeof v1Row?.internal_id).toBe("string");
		} finally {
			await autumnV2_3.products.delete(planId).catch(() => {});
		}
	},
);
