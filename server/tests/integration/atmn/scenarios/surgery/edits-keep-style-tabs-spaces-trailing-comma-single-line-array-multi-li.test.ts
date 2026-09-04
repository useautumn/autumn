/**
 * atmn scenarios/surgery — edits keep style [tabs, spaces, trailing comma, single-line array, multi-line array, comments inside the literal]
 *
 * One line of plans/atmn-v3/07_tests.md. [a, b] is a matrix looped INSIDE this file.
 */

import { expect, test } from "bun:test";
import { uniqueTestId } from "@tests/integration/catalog-v2/utils/uniqueTestId.js";
import {
	atmnImports,
	initAtmnScenario,
} from "@tests/utils/atmnUtils/initAtmnScenario.js";
import { s } from "@tests/utils/testInitUtils/initScenario.js";

type StyleCase = {
	/** The whole config, with a `keep` plan the pull must never touch. */
	raw: (editId: string, keepId: string) => string;
	/** Verbatim text that must survive the edit unchanged. */
	survives: (keepId: string) => string;
};

const STYLES: Record<string, StyleCase> = {
	tabs: {
		raw: (editId, keepId) => `${atmnImports()}
export default atmn({
	plans: [
		plan({
			planId: "${editId}",
			name: "Edit",
			price: { amount: 20, interval: "month" },
		}),
		plan({
			planId: "${keepId}",
			name: "Keep",
			price: { amount: 5, interval: "month" },
		}),
	],
});
`,
		survives: (keepId) =>
			`\t\tplan({\n\t\t\tplanId: "${keepId}",\n\t\t\tname: "Keep",\n\t\t\tprice: { amount: 5, interval: "month" },\n\t\t}),`,
	},
	spaces: {
		raw: (editId, keepId) => `${atmnImports()}
export default atmn({
  plans: [
    plan({
      planId: "${editId}",
      name: "Edit",
      price: { amount: 20, interval: "month" },
    }),
    plan({
      planId: "${keepId}",
      name: "Keep",
      price: { amount: 5, interval: "month" },
    }),
  ],
});
`,
		survives: (keepId) =>
			`    plan({\n      planId: "${keepId}",\n      name: "Keep",\n      price: { amount: 5, interval: "month" },\n    }),`,
	},
	"trailing comma": {
		raw: (editId, keepId) => `${atmnImports()}
export default atmn({
	plans: [
		plan({ planId: "${editId}", name: "Edit", price: { amount: 20, interval: "month" } }),
		plan({ planId: "${keepId}", name: "Keep", price: { amount: 5, interval: "month" } }),
	],
});
`,
		survives: (keepId) =>
			`plan({ planId: "${keepId}", name: "Keep", price: { amount: 5, interval: "month" } }),`,
	},
	"single-line array": {
		raw: (editId, keepId) => `${atmnImports()}
export default atmn({
	plans: [plan({ planId: "${editId}", name: "Edit", price: { amount: 20, interval: "month" } }), plan({ planId: "${keepId}", name: "Keep", price: { amount: 5, interval: "month" } })],
});
`,
		survives: (keepId) =>
			`plan({ planId: "${keepId}", name: "Keep", price: { amount: 5, interval: "month" } })`,
	},
	"multi-line array": {
		raw: (editId, keepId) => `${atmnImports()}
export default atmn({
	plans: [
		plan({
			planId: "${editId}",
			name: "Edit",
			price: {
				amount: 20,
				interval: "month",
			},
		}),
		plan({
			planId: "${keepId}",
			name: "Keep",
			price: {
				amount: 5,
				interval: "month",
			},
		}),
	],
});
`,
		survives: (keepId) =>
			`plan({\n\t\t\tplanId: "${keepId}",\n\t\t\tname: "Keep",\n\t\t\tprice: {\n\t\t\t\tamount: 5,\n\t\t\t\tinterval: "month",\n\t\t\t},\n\t\t}),`,
	},
};

for (const [style, { raw, survives }] of Object.entries(STYLES)) {
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

			await scenario.client.update({
				plans: [{ plan_id: editId, price: { amount: 30, interval: "month" } }],
				skip_deletions: false,
				migration: { draft: true },
			});

			const pulled = await scenario.pull();
			expect(pulled.replaced).toContain(editId);

			const text = scenario.files().get("autumn.config.ts") ?? "";
			expect(text).toContain("amount: 30");
			expect(text).toContain(survives(keepId));
		} finally {
			scenario.cleanup();
		}
	});
}

test.concurrent("edits keep style [comments inside the literal]", async () => {
	// Decision pending: replaceFixture swaps the whole call's text from the
	// server's row, so a comment nested inside the rewritten object is lost —
	// this asserts that as the actual, deliberate behavior.
	const editId = uniqueTestId("atmn_style_comment");

	const scenario = await initAtmnScenario({
		setup: [
			s.platform.create({ userEmail: `${uniqueTestId("atmn")}@autumn.test` }),
		],
		config: {
			raw: `${atmnImports()}
export default atmn({
	plans: [
		plan({
			planId: "${editId}",
			// A note living inside the fixture literal.
			name: "Edit",
			price: { amount: 20, interval: "month" },
		}),
	],
});
`,
		},
	});

	try {
		await scenario.push();

		await scenario.client.update({
			plans: [{ plan_id: editId, price: { amount: 30, interval: "month" } }],
			skip_deletions: false,
			migration: { draft: true },
		});

		const pulled = await scenario.pull();
		expect(pulled.replaced).toContain(editId);

		const text = scenario.files().get("autumn.config.ts") ?? "";
		expect(text).toContain("amount: 30");
		expect(text).not.toContain("A note living inside the fixture literal.");
	} finally {
		scenario.cleanup();
	}
});
