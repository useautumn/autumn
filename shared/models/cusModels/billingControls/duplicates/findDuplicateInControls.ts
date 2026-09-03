import type { DuplicateBillingControlIssue } from "./types/duplicateBillingControlIssue.js";
import type { DuplicateCheckedControlKey } from "./types/duplicateCheckedBillingControls.js";
import type { DuplicateRule } from "./types/duplicateRule.js";

/** The first entry whose identity repeats an earlier one; entries with no identity never collide. */
export const findDuplicateInControls = <TControl>({
	controlKey,
	controls,
	rule,
}: {
	controlKey: DuplicateCheckedControlKey;
	controls: TControl[];
	rule: DuplicateRule<TControl>;
}): DuplicateBillingControlIssue | undefined => {
	const seen = new Set<string>();

	for (const [index, control] of controls.entries()) {
		const identity = rule.identityOf(control);
		if (identity === undefined) continue;

		if (seen.has(identity)) {
			return {
				code: "custom",
				message: rule.message,
				input: control[rule.field],
				path: [controlKey, index, rule.field],
			};
		}
		seen.add(identity);
	}
	return undefined;
};
