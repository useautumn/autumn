import type { DbUsageAlert, DbUsageAlertParams } from "./usageAlert.js";
import { usageAlertIdentity } from "./usageAlertIdentity.js";
import {
	type DbUsageLimit,
	type DbUsageLimitParams,
	usageLimitIdentity,
} from "./usageLimit.js";

type FeatureKeyedControl = { feature_id?: string };
type UsageLimitLike = Pick<
	DbUsageLimit | DbUsageLimitParams,
	"feature_id" | "filter"
>;
type UsageAlertLike = DbUsageAlert | DbUsageAlertParams;

type ControlsByKey = {
	auto_topups?: FeatureKeyedControl[] | null;
	spend_limits?: FeatureKeyedControl[] | null;
	usage_limits?: UsageLimitLike[] | null;
	usage_alerts?: UsageAlertLike[] | null;
	overage_allowed?: FeatureKeyedControl[] | null;
};

type DuplicateRule<TControl> = {
	identityOf: (control: TControl) => string | undefined;
	field: keyof TControl & string;
	message: string;
};

const featureIdIdentity = (control: FeatureKeyedControl) => control.feature_id;

const DUPLICATE_RULES: {
	[TKey in keyof ControlsByKey]-?: DuplicateRule<
		NonNullable<ControlsByKey[TKey]>[number]
	>;
} = {
	auto_topups: {
		identityOf: featureIdIdentity,
		field: "feature_id",
		message: "Only one auto top-up entry is allowed per feature_id",
	},
	spend_limits: {
		identityOf: featureIdIdentity,
		field: "feature_id",
		message: "Only one spend limit entry is allowed per feature_id",
	},
	usage_limits: {
		identityOf: usageLimitIdentity,
		field: "feature_id",
		message: "Only one usage limit entry is allowed per feature_id and filter",
	},
	usage_alerts: {
		identityOf: usageAlertIdentity,
		field: "threshold",
		message:
			"Only one usage alert entry is allowed per feature_id, basis, filter, threshold_type and threshold",
	},
	overage_allowed: {
		identityOf: featureIdIdentity,
		field: "feature_id",
		message: "Only one overage_allowed entry is allowed per feature_id",
	},
};

type DuplicateBillingControlIssue = {
	code: "custom";
	message: string;
	input: unknown;
	path: Array<string | number>;
};

const findDuplicateInList = <TControl>({
	controlKey,
	controls,
	rule,
}: {
	controlKey: keyof ControlsByKey;
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

/** The first duplicate entry across every control list present, as a validation issue. */
export const findDuplicateBillingControlIssue = (
	billingControls: ControlsByKey,
): DuplicateBillingControlIssue | undefined => {
	for (const controlKey of Object.keys(DUPLICATE_RULES) as Array<
		keyof ControlsByKey
	>) {
		const controls = billingControls[controlKey];
		if (!controls) continue;
		const issue = findDuplicateInList({
			controlKey,
			controls: controls as never[],
			rule: DUPLICATE_RULES[controlKey] as DuplicateRule<never>,
		});
		if (issue) return issue;
	}
	return undefined;
};
