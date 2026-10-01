/**
 * The shared atmn fixtures are CLI source; they must pass atmn's own config
 * lint, or every integration test built on them fails at `atmn push`.
 */

import { expect, test } from "bun:test";
import {
	configBody,
	enterpriseWithSeats,
	everyFeatureType,
	freePlan,
	paidMonthly,
	seatPlan,
	versionedPro,
} from "@tests/utils/atmnUtils/baseConfigs.js";
import { feature } from "../../../../packages/atmn/src/generated/features";
import { ConfigError } from "../../../../packages/atmn/src/generated/lintRuntime";
import { plan } from "../../../../packages/atmn/src/generated/plans";
import { atmn } from "../../../../packages/atmn/src/generated/wire";

const lintIssues = ({ body }: { body: string }): string[] => {
	try {
		new Function("atmn", "feature", "plan", `return atmn(${body});`)(
			atmn,
			feature,
			plan,
		);
	} catch (error) {
		if (error instanceof ConfigError)
			return error.issues.map((issue) => `${issue.path} / ${issue.message}`);
		throw error;
	}
	return [];
};

test("the shared fixtures lint clean", () => {
	const body = configBody({
		features: everyFeatureType,
		plans: [
			freePlan,
			paidMonthly({ planId: "starter" }),
			versionedPro(),
			seatPlan,
			enterpriseWithSeats(),
		].join(""),
	});

	expect(lintIssues({ body })).toEqual([]);
});
