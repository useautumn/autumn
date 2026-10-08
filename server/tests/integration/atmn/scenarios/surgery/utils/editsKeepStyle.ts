import { atmnImports } from "@tests/utils/atmnUtils/initAtmnScenario.js";

export type StyleCase = {
	/** The whole config, with a `keep` plan the pull must never touch. */
	raw: (editId: string, keepId: string) => string;
};

/** The `plan({ active: true,...})` call naming `planId`, verbatim — balances parens rather
 * than assuming a shape, since push backfills `internalId` into it first. */
export const extractPlanBlock = (text: string, planId: string): string => {
	const markerIndex = text.indexOf(`planId: "${planId}"`);
	if (markerIndex === -1) throw new Error(`planId ${planId} not found`);
	const start = text.lastIndexOf("plan({ active: true,", markerIndex);
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

export const STYLES: Record<string, StyleCase> = {
	tabs: {
		raw: (editId, keepId) => `${atmnImports()}
export default atmn({
	plans: [
		plan({
			active: true,
			planId: "${editId}",
			name: "Edit",
			versionSlug: "v1",
			price: { amount: 20, interval: "month" },
		}),
		plan({
			active: true,
			planId: "${keepId}",
			name: "Keep",
			versionSlug: "v1",
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
      active: true,
      planId: "${editId}",
      name: "Edit",
      versionSlug: "v1",
      price: { amount: 20, interval: "month" },
    }),
    plan({
      active: true,
      planId: "${keepId}",
      name: "Keep",
      versionSlug: "v1",
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
		plan({ active: true, planId: "${editId}", name: "Edit", versionSlug: "v1", price: { amount: 20, interval: "month" } }),
		plan({ active: true, planId: "${keepId}", name: "Keep", versionSlug: "v1", price: { amount: 5, interval: "month" } }),
	],
});
`,
	},
	"single-line array": {
		raw: (editId, keepId) => `${atmnImports()}
export default atmn({
	plans: [plan({ active: true, planId: "${editId}", name: "Edit", versionSlug: "v1", price: { amount: 20, interval: "month" } }), plan({ active: true, planId: "${keepId}", name: "Keep", versionSlug: "v1", price: { amount: 5, interval: "month" } })],
});
`,
	},
	"multi-line array": {
		raw: (editId, keepId) => `${atmnImports()}
export default atmn({
	plans: [
		plan({
			active: true,
			planId: "${editId}",
			name: "Edit",
			versionSlug: "v1",
			price: {
				amount: 20,
				interval: "month",
			},
		}),
		plan({
			active: true,
			planId: "${keepId}",
			name: "Keep",
			versionSlug: "v1",
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
