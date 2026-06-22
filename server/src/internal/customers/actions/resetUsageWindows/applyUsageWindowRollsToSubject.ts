import type { FullSubject, NormalizedFullSubject } from "@autumn/shared";
import type { UsageWindowRoll } from "./computeUsageWindowRolls.js";

/** Mirrors persisted rolls onto the in-flight subject (and its normalized
 *  twin), so this request's response already shows the rolled state. */
export const applyUsageWindowRollsToSubject = ({
	fullSubject,
	normalized,
	rolls,
	now,
}: {
	fullSubject: FullSubject;
	normalized?: NormalizedFullSubject;
	rolls: UsageWindowRoll[];
	now: number;
}): void => {
	const rollsById = new Map(rolls.map((roll) => [roll.id, roll]));

	const apply = (windows: FullSubject["usage_windows"]) => {
		for (const usageWindow of windows ?? []) {
			const roll = rollsById.get(usageWindow.id);
			if (!roll) continue;
			if (roll.zero_usage) usageWindow.usage = 0;
			usageWindow.window_start_at = roll.window_start_at;
			usageWindow.window_end_at = roll.window_end_at;
			usageWindow.anchor_customer_entitlement_id =
				roll.anchor_customer_entitlement_id;
			usageWindow.updated_at = now;
		}
	};

	apply(fullSubject.usage_windows);
	if (normalized) apply(normalized.usage_windows);
};
