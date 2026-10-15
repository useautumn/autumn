import type {
	ApprovalAction,
	ApprovalRule,
	ApprovalRuleWhen,
	CreateApprovalRuleParams,
	RuleSubject,
} from "@autumn/shared";
import { ruleWhenArea } from "./ruleActions";

export type RuleEditorValues = {
	name: string;
	subjects: RuleSubject[];
	actions: ApprovalAction[];
	/** Kept opaque: the form's deep-key types can't walk the `when` union. */
	when: unknown;
	note: string;
	enabled: boolean;
};

export type EditorValuesResult = {
	ok: true;
	params: CreateApprovalRuleParams;
};

export const emptyEditorValues = (): RuleEditorValues => ({
	name: "",
	subjects: [],
	actions: [],
	when: null,
	note: "",
	enabled: true,
});

export const ruleToEditorValues = ({
	rule,
}: {
	rule: ApprovalRule;
}): RuleEditorValues => ({
	name: rule.name,
	subjects: rule.subjects,
	actions: rule.actions,
	when: rule.when,
	note: rule.note ?? "",
	enabled: rule.enabled,
});

export const editorValuesToParams = ({
	values,
}: {
	values: RuleEditorValues;
}): EditorValuesResult => ({
	ok: true,
	params: {
		name: values.name.trim(),
		subjects: values.subjects,
		actions: values.actions,
		when: ruleWhenArea({ actions: values.actions })
			? (values.when as ApprovalRuleWhen | null)
			: null,
		note: values.note.trim() || null,
		enabled: values.enabled,
	},
});
