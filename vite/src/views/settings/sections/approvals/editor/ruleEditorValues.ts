import type {
	ApprovalAction,
	ApprovalRule,
	ApprovalRuleEffect,
	ApprovalRuleFilter,
	CreateApprovalRuleParams,
	RuleSubject,
} from "@autumn/shared";
import { ruleFilterKey } from "./ruleActions";

export type RuleEditorValues = {
	name: string;
	effect: ApprovalRuleEffect;
	subjects: RuleSubject[];
	actions: ApprovalAction[];
	/** Kept opaque: the form's deep-key types can't walk the filter union. */
	filter: unknown;
	note: string;
	enabled: boolean;
};

export const emptyEditorValues = (): RuleEditorValues => ({
	name: "",
	effect: "block",
	subjects: [],
	actions: [],
	filter: null,
	note: "",
	enabled: true,
});

export const ruleToEditorValues = ({
	rule,
}: {
	rule: ApprovalRule;
}): RuleEditorValues => ({
	name: rule.name,
	effect: rule.effect,
	subjects: rule.subjects,
	actions: rule.actions,
	filter: rule.filter,
	note: rule.note ?? "",
	enabled: rule.enabled,
});

export const editorValuesToParams = ({
	values,
}: {
	values: RuleEditorValues;
}): { ok: true; params: CreateApprovalRuleParams } => ({
	ok: true,
	params: {
		name: values.name.trim(),
		effect: values.effect,
		subjects: values.subjects,
		actions: values.actions,
		filter: ruleFilterKey({ actions: values.actions })
			? (values.filter as ApprovalRuleFilter | null)
			: null,
		note: values.note.trim() || null,
		enabled: values.enabled,
	},
});
