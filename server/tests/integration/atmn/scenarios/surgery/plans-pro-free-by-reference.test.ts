import { expect, test } from "bun:test";
import { uniqueTestId } from "@tests/integration/catalog-v2/utils/uniqueTestId.js";
import {
	atmnImports,
	initAtmnScenario,
} from "@tests/utils/atmnUtils/initAtmnScenario.js";
import { s } from "@tests/utils/testInitUtils/initScenario.js";

test.concurrent(
	"`plans: [pro, free]` by reference → delete removes the export and the reference",
	async () => {
		const proId = uniqueTestId("atmn_ref_pro");
		const freeId = uniqueTestId("atmn_ref_free");

		const scenario = await initAtmnScenario({
			setup: [
				s.platform.create({ userEmail: `${uniqueTestId("atmn")}@autumn.test` }),
			],
			config: {
				raw: `${atmnImports()}
export const pro = plan({
	active: true,
	planId: "${proId}",
	name: "Pro",
	versionSlug: "v1",
	price: { amount: 20, interval: "month" },
});

export const free = plan({
	active: true,
	planId: "${freeId}",
	name: "Free",
	versionSlug: "v1",
});

export default atmn({
	plans: [pro, free],
});
`,
			},
		});

		try {
			await scenario.push();

			await scenario.client.update({
				plans: [{ plan_id: freeId, name: "Free" }],
				skip_deletions: false,
				migration: { draft: true },
			});

			const pulled = await scenario.pull();
			expect(pulled.deleted).toContain(proId);

			const text = scenario.files().get("autumn.config.ts") ?? "";
			expect(text).not.toContain("export const pro");
			expect(text).not.toContain(proId);
			expect(text).toContain("export const free");
			expect(text).toContain(freeId);
			expect(text).toContain("plans: [free]");
		} finally {
			scenario.cleanup();
		}
	},
);
