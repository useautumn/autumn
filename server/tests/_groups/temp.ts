import type { TestGroup } from "./types";

const activeTempPaths = [
	"integration/crud/plans/variants/core-contract.test.ts",
	"integration/crud/plans/variants/feature-drop-propagation.test.ts",
	"integration/crud/plans/variants/interval-family.test.ts",
	"integration/crud/plans/variants/lifecycle.test.ts",
	"integration/crud/plans/variants/reset-tier-ladder.test.ts",
	"integration/crud/plans/variants/rollover-disambiguation.test.ts",
	"integration/crud/plans/variants/stripe-resource-carryover.test.ts",
	"integration/crud/plans/previewUpdate/preview-update-plan-basic.test.ts",
	"integration/crud/plans/versioning/pro-annual-propagation.test.ts",
	"integration/crud/plans/versioning/pro-usage-ladder-variants.test.ts",
];

export const temp: TestGroup = {
	name: "temp",
	description: "Plan variant regression tests",
	tier: "domain",
	paths: activeTempPaths,
	maxConcurrency: 2,
};
