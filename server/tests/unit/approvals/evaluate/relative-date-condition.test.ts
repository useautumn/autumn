/**
 * S4a contract: a relative-date condition always reads as something; an empty
 * matcher (any date) says so instead of leaving the limit blank.
 *
 * Red (before):  `starts_at: {}` matched with `limit: ""`.
 * Green (after): it reads "any date".
 */

import { describe, expect, test } from "bun:test";
import { matchRuleFilter } from "@autumn/shared/api/approvals/evaluate/index.js";
import { rules } from "@tests/utils/fixtures/rules.js";
import { facts } from "./utils/facts.js";
import { MATCH_NOW, matchContext } from "./utils/matchContext.js";

describe("relative date conditions", () => {
	test("an empty matcher reads as any date", () => {
		const { conditions } = matchRuleFilter({
			rule: rules.block({ filter: { starts_at: {} } }),
			action: "billing.attach",
			facts: facts.billingChange({ starts_at: MATCH_NOW.getTime() }),
			context: matchContext,
		});
		expect(conditions).toEqual([
			{
				field: "starts_at",
				label: "Start date",
				limit: "any date",
				actual: expect.any(String),
			},
		]);
	});
});
