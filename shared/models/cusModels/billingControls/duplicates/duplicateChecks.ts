import { featureIdIdentity } from "../identity/featureIdIdentity.js";
import { usageAlertIdentity } from "../identity/usageAlertIdentity.js";
import { usageLimitIdentity } from "../usageLimit.js";
import { findDuplicateInControls } from "./findDuplicateInControls.js";
import type { DuplicateBillingControlIssue } from "./types/duplicateBillingControlIssue.js";
import type {
	DuplicateCheckedBillingControls,
	DuplicateCheckedControl,
	DuplicateCheckedControlKey,
} from "./types/duplicateCheckedBillingControls.js";
import type { DuplicateRule } from "./types/duplicateRule.js";

export type DuplicateCheck = (
	billingControls: DuplicateCheckedBillingControls,
) => DuplicateBillingControlIssue | undefined;

const duplicateCheck =
	<TKey extends DuplicateCheckedControlKey>({
		controlKey,
		...rule
	}: { controlKey: TKey } & DuplicateRule<
		DuplicateCheckedControl<TKey>
	>): DuplicateCheck =>
	(billingControls) =>
		findDuplicateInControls({
			controlKey,
			controls: billingControls[controlKey] ?? [],
			rule,
		});

export const DUPLICATE_CHECKS: DuplicateCheck[] = [
	duplicateCheck({
		controlKey: "auto_topups",
		identityOf: featureIdIdentity,
		field: "feature_id",
		message: "Only one auto top-up entry is allowed per feature_id",
	}),
	duplicateCheck({
		controlKey: "spend_limits",
		identityOf: featureIdIdentity,
		field: "feature_id",
		message: "Only one spend limit entry is allowed per feature_id",
	}),
	duplicateCheck({
		controlKey: "usage_limits",
		identityOf: usageLimitIdentity,
		field: "feature_id",
		message: "Only one usage limit entry is allowed per feature_id and filter",
	}),
	duplicateCheck({
		controlKey: "usage_alerts",
		identityOf: usageAlertIdentity,
		field: "threshold",
		message:
			"Only one usage alert entry is allowed per feature_id, basis, filter, threshold_type and threshold",
	}),
	duplicateCheck({
		controlKey: "overage_allowed",
		identityOf: featureIdIdentity,
		field: "feature_id",
		message: "Only one overage_allowed entry is allowed per feature_id",
	}),
];
