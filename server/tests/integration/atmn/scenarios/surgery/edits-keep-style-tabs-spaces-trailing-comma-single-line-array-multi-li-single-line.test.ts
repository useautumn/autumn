/**
 * atmn scenarios/surgery — edits keep style [trailing comma, single-line array]
 * Slice of one line of plans/atmn-v3/07_tests.md; the shared style cases live in utils/editsKeepStyle.ts.
 */

import { expect, test } from "bun:test";
import { uniqueTestId } from "@tests/integration/catalog-v2/utils/uniqueTestId.js";
import { initAtmnScenario } from "@tests/utils/atmnUtils/initAtmnScenario.js";
import { s } from "@tests/utils/testInitUtils/initScenario.js";
import { extractPlanBlock, STYLES } from "./utils/editsKeepStyle.js";

for (const [style, { raw }] of Object.entries(STYLES).filter(([name]) =>
	["trailing comma", "single-line array"].includes(name),
)) {
	test.concurrent(`edits keep style [${style}]`, async () => {
		const editId = uniqueTestId("atmn_style_edit");
		const keepId = uniqueTestId("atmn_style_keep");

		const scenario = await initAtmnScenario({
			setup: [
				s.platform.create({ userEmail: `${uniqueTestId("atmn")}@autumn.test` }),
			],
			config: { raw: raw(editId, keepId) },
		});

		try {
			await scenario.push();

			// `keep`'s block already carries the internalId push backfilled into
			// it; that — not the internalId-less source — is what must survive.
			const keepBeforeEdit = extractPlanBlock(
				scenario.files().get("autumn.config.ts") ?? "",
				keepId,
			);

			// Dashboard-style price edit of `edit` only; `keep` rides along in the
			// full-state payload unchanged so it is not deleted server-side.
			await scenario.client.update({
				plans: [
					{ plan_id: editId, price: { amount: 30, interval: "month" } },
					{
						plan_id: keepId,
						name: "Keep",
						price: { amount: 5, interval: "month" },
					},
				],
				skip_deletions: false,
				migration: { draft: true },
			});

			const pulled = await scenario.pull();
			expect(pulled.replaced).toContain(`${editId}@v1`);

			const text = scenario.files().get("autumn.config.ts") ?? "";
			expect(text).toContain("amount: 30");
			expect(extractPlanBlock(text, keepId)).toBe(keepBeforeEdit);
		} finally {
			scenario.cleanup();
		}
	});
}
