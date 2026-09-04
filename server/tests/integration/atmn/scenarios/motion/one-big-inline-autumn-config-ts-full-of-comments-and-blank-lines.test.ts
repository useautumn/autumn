/**
 * atmn scenarios/motion — one big inline `autumn.config.ts` full of comments and blank lines → a plan added remotely → pull appends one fixture to `plans`; the diff of the file is exactly that appended literal
 *
 * code in motion: the config's shape is the user's; pull edits the AST, never rewrites a file
 *
 * One line of plans/atmn-v3/07_tests.md. [a, b] is a matrix looped INSIDE this file.
 */

import { expect, test } from "bun:test";
import { atmnImports, initAtmnScenario } from "@tests/utils/atmnUtils/initAtmnScenario.js";
import { s } from "@tests/utils/testInitUtils/initScenario.js";
import { uniqueTestId } from "@tests/integration/catalog-v2/utils/uniqueTestId.js";

/** The text inserted between `before` and `after`, asserting nothing else moved. */
const insertedText = ({
	before,
	after,
}: {
	before: string;
	after: string;
}): string => {
	let prefixLength = 0;
	while (
		prefixLength < before.length &&
		before[prefixLength] === after[prefixLength]
	)
		prefixLength++;
	let suffixLength = 0;
	while (
		suffixLength < before.length - prefixLength &&
		suffixLength < after.length - prefixLength &&
		before[before.length - 1 - suffixLength] ===
			after[after.length - 1 - suffixLength]
	)
		suffixLength++;
	expect(before.slice(prefixLength, before.length - suffixLength)).toBe("");
	return after.slice(prefixLength, after.length - suffixLength);
};

test.concurrent(
	"one big inline autumn.config.ts full of comments and blank lines → a plan added remotely → pull appends one fixture to `plans`; the diff of the file is exactly that appended literal",
	async () => {
		const seats = uniqueTestId("atmn_seats");
		const freeId = uniqueTestId("atmn_free");
		const remoteId = uniqueTestId("atmn_remote");

		const scenario = await initAtmnScenario({
			setup: [
				s.platform.create({ userEmail: `${uniqueTestId("atmn")}@autumn.test` }),
			],
			config: {
				raw: `${atmnImports()}
// Top-of-file banter: this whole config lives in one file, comments and all.

/* A block comment above the call. */
export default atmn({
	// Features first.
	features: [
		feature({ featureId: "${seats}", name: "Seats", type: "metered", consumable: false }), // inline note
	],

	// Then plans — blank lines and comments sprinkled throughout.
	plans: [
		plan({
			planId: "${freeId}",
			name: "Free",
			// a comment nested inside the fixture
			items: [{ featureId: "${seats}", included: 1 }],
		}),
	],
});
`,
			},
		});

		try {
			await scenario.push();

			const before = scenario.files();
			const wire = await scenario.wireFromConfig();
			const plans = (wire.plans as Record<string, unknown>[]) ?? [];
			await scenario.client.update({
				...wire,
				plans: [...plans, { plan_id: remoteId, name: "Remote" }],
			});

			const pulled = await scenario.pull();
			expect(pulled.appended.length).toBeGreaterThan(0);

			const after = scenario.files();
			const changedFiles = [...after.keys()].filter(
				(key) => after.get(key) !== before.get(key),
			);
			expect(changedFiles).toEqual(["autumn.config.ts"]);

			const diff = insertedText({
				before: before.get("autumn.config.ts") ?? "",
				after: after.get("autumn.config.ts") ?? "",
			});
			expect(diff).toContain(`planId: "${remoteId}"`);
		} finally {
			scenario.cleanup();
		}
	},
);
