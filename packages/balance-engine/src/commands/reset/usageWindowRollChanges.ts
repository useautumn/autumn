import {
	fullSubjectToUsageWindowLimits,
	orgToInStatuses,
	type UsageWindowRoll,
	usageWindowsToRolls,
} from "@autumn/shared";
import { usageWindowFeaturesOf } from "../../deduction/utils/limits/usageWindowFeaturesOf.js";
import type { RowChange } from "../../models/mutation/rowChange.js";
import type { WorkerUsageWindow } from "../../models/subject/rows/workerUsageWindow.js";
import type {
	WorkerFullCustomerEntitlement,
	WorkerFullSubject,
} from "../../models/subject/workerFullSubject.js";
import { fullSubjectToHeldRows } from "../../utils/subjectUtils/convertSubjectUtils.js";
import type { ResetCommand } from "./types/resetCommand.js";
import type { ResetRow } from "./types/resetResult.js";

/** The subject as it stands once this reset lands: a refilled row's cycle has moved to its next reset. */
const withRefilledCycles = ({
	fullSubject,
	refilledRows,
}: {
	fullSubject: WorkerFullSubject;
	refilledRows: ResetRow[];
}): WorkerFullSubject => {
	const nextResetAtById = new Map(
		refilledRows.map((row) => [row.customerEntitlementId, row.nextResetAt]),
	);
	const refilled = <Row extends WorkerFullCustomerEntitlement>(
		row: Row,
	): Row =>
		nextResetAtById.has(row.id)
			? { ...row, next_reset_at: nextResetAtById.get(row.id) ?? null }
			: row;
	return {
		...fullSubject,
		customer_products: fullSubject.customer_products.map((customerProduct) => ({
			...customerProduct,
			customer_entitlements:
				customerProduct.customer_entitlements.map(refilled),
		})),
		extra_customer_entitlements:
			fullSubject.extra_customer_entitlements.map(refilled),
		pooled_customer_entitlements:
			fullSubject.pooled_customer_entitlements.map(refilled),
	};
};

/** Each counter's limit as the subject now derives it; a counter with no limit keeps its bounds. */
const fullSubjectToUsageWindowRolls = ({
	fullSubject,
	command,
}: {
	fullSubject: WorkerFullSubject;
	command: ResetCommand;
}): UsageWindowRoll[] => {
	const usageWindows = fullSubject.usage_windows;
	if (usageWindows.length === 0) return [];
	const heldRows = fullSubjectToHeldRows({ fullSubject });
	const features = usageWindows.flatMap((usageWindow) =>
		usageWindowFeaturesOf({
			featureId: usageWindow.feature_id,
			internalFeatureId: usageWindow.internal_feature_id,
			customerEntitlements: heldRows,
		}),
	);
	const limits = fullSubjectToUsageWindowLimits({
		fullSubject,
		featureIds: usageWindows.map((usageWindow) => usageWindow.feature_id),
		features,
		now: command.occurredAt,
		inStatuses: orgToInStatuses({ org: command.org }),
	});
	return usageWindowsToRolls({ usageWindows, limits, now: command.occurredAt });
};

/** A counter with no limit left stays expired, so it rolls on every reset; once zeroed there is nothing to write. */
const rollChangesNothing = ({
	usageWindow,
	roll,
}: {
	usageWindow: WorkerUsageWindow;
	roll: UsageWindowRoll;
}): boolean =>
	usageWindow.anchor_customer_entitlement_id ===
		roll.anchor_customer_entitlement_id &&
	usageWindow.window_start_at === roll.window_start_at &&
	usageWindow.window_end_at === roll.window_end_at &&
	(!roll.zero_usage || usageWindow.usage === 0);

/** A roll re-bounds the counter, and zeroes its count only when the window it counted in is over. */
const usageWindowRollToChange = ({
	usageWindow,
	roll,
	now,
}: {
	usageWindow: WorkerUsageWindow;
	roll: UsageWindowRoll;
	now: number;
}): RowChange => ({
	table: "usageWindows",
	op: "update",
	id: usageWindow.id,
	before: {
		anchor_customer_entitlement_id: usageWindow.anchor_customer_entitlement_id,
		window_start_at: usageWindow.window_start_at,
		window_end_at: usageWindow.window_end_at,
		...(roll.zero_usage ? { usage: usageWindow.usage } : {}),
		updated_at: usageWindow.updated_at,
	},
	after: {
		anchor_customer_entitlement_id: roll.anchor_customer_entitlement_id,
		window_start_at: roll.window_start_at,
		window_end_at: roll.window_end_at,
		...(roll.zero_usage ? { usage: 0 } : {}),
		updated_at: now,
	},
});

/** The counters this reset rolls to their limits' current windows, judged after its refills land. */
export const usageWindowRollChanges = ({
	fullSubject,
	command,
	refilledRows,
}: {
	fullSubject: WorkerFullSubject;
	command: ResetCommand;
	refilledRows: ResetRow[];
}): RowChange[] => {
	const rolls = fullSubjectToUsageWindowRolls({
		fullSubject: withRefilledCycles({ fullSubject, refilledRows }),
		command,
	});
	const usageWindowById = new Map(
		fullSubject.usage_windows.map((usageWindow) => [
			usageWindow.id,
			usageWindow,
		]),
	);
	return rolls.flatMap((roll) => {
		const usageWindow = usageWindowById.get(roll.id);
		return usageWindow && !rollChangesNothing({ usageWindow, roll })
			? [
					usageWindowRollToChange({
						usageWindow,
						roll,
						now: command.occurredAt,
					}),
				]
			: [];
	});
};
