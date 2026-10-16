/**
 * S5 contract with S3's validator: a Balances rule's pinned Feature only
 * stores what `checkFeatureChosen` accepts (an id or a non-empty `$in`),
 * so the Feature row offers just "is" and "is any of".
 *
 * Red (before):  an empty Feature id is stored and the validator rejects the rule.
 * Green (after): every pinned Feature the editor stores passes the validator.
 */

import { expect, test } from "bun:test";
import {
	type ApprovalAction,
	type ApprovalRuleEffect,
	validateApprovalRule,
} from "@autumn/shared";
import {
	EDITOR_FIELDS,
	type EditorRow,
	ruleRowsToFilter,
} from "@autumn/shared/api/approvals/editor/index.js";
import { rules } from "@tests/utils/fixtures/rules.js";

const SHAPES: ["balance_create" | "balance_update", ApprovalAction][] = [
	["balance_create", "balances.create"],
	["balance_update", "balances.update"],
];
const EFFECTS: ApprovalRuleEffect[] = ["allow", "block"];
const cells = SHAPES.flatMap(([shape, action]) =>
	EFFECTS.map((effect) => ({ shape, action, effect })),
);

test.each(SHAPES)(
	"%s: the Feature row offers only is and is any of",
	(shape) => {
		expect<unknown>(EDITOR_FIELDS[shape].feature).toEqual(["is", "is_any_of"]);
	},
);

test.each(
	cells.flatMap((cell) =>
		[
			{ operator: "is", value: "ai_credits", stored: "ai_credits" },
			{
				operator: "is_any_of",
				value: ["ai_credits", "messages"],
				stored: { $in: ["ai_credits", "messages"] },
			},
		].map((row) => ({ ...cell, ...row })),
	),
)(
	"$effect · $shape · Feature $operator passes the validator",
	({ shape, action, effect, operator, value, stored }) => {
		const pinned = { field: "feature", operator, value } as EditorRow;
		const result = ruleRowsToFilter({ shape, effect, pinned, groups: [] });
		expect<unknown>(result).toEqual({
			ok: true,
			filter: { feature_id: stored },
		});
		if (!result.ok) return;
		const rule = rules[effect]({ actions: [action], filter: result.filter });
		expect(validateApprovalRule({ rule }).ok).toBe(true);
	},
);

test.each(
	cells.flatMap((cell) =>
		[
			{ operator: "is", value: "" },
			{ operator: "is_any_of", value: [] },
			{ operator: "is_any_of", value: [""] },
			{ operator: "is_not", value: "ai_credits" },
		].map((row) => ({ ...cell, ...row })),
	),
)(
	"$effect · $shape · Feature $operator $value reports an issue instead of saving",
	({ shape, effect, operator, value }) => {
		const pinned = { field: "feature", operator, value } as EditorRow;
		expect(ruleRowsToFilter({ shape, effect, pinned, groups: [] })).toEqual({
			ok: false,
			issues: [{ group: "pinned", row: 0, message: expect.any(String) }],
		});
	},
);
