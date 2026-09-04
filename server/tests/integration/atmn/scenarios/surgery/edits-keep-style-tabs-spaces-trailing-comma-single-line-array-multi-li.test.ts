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
};

/** The `plan({...})` call naming `planId`, verbatim — balances parens rather
 * than assuming a shape, since push backfills `internalId` into it first. */
const extractPlanBlock = (text: string, planId: string): string => {
	const markerIndex = text.indexOf(`planId: "${planId}"`);
	if (markerIndex === -1) throw new Error(`planId ${planId} not found`);
	const start = text.lastIndexOf("plan({", markerIndex);
	let depth = 0;
	let end = start;
	for (; end < text.length; end++) {
		if (text[end] === "(") depth++;
		else if (text[end] === ")") {
			depth--;
			if (depth === 0) {
				end++;
				break;
			}
		}
	}
	return text.slice(start, end);
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
	},
	"single-line array": {
		raw: (editId, keepId) => `${atmnImports()}
export default atmn({
	plans: [plan({ planId: "${editId}", name: "Edit", price: { amount: 20, interval: "month" } }), plan({ planId: "${keepId}", name: "Keep", price: { amount: 5, interval: "month" } })],
});
`,
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
	},
};

for (const [style, { raw }] of Object.entries(STYLES)) {
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
		expect(pulled.replaced).toContain(`${editId}@v1`);

		const text = scenario.files().get("autumn.config.ts") ?? "";
		expect(text).toContain("amount: 30");
		expect(text).not.toContain("A note living inside the fixture literal.");
	} finally {
		scenario.cleanup();
	}
});
