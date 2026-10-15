import {
	type ApprovalAction,
	type ApprovalRule,
	type CreateApprovalRuleParams,
	type EditorRowIssue,
	PINNED_FIELDS,
	type RuleSubject,
	rowsToWhen,
	type WhenKey,
	whenToRows,
} from "@autumn/shared";
import type { FilterRowGroup } from "@/components/filters/types";
import { ruleWhenArea } from "./ruleActions";
import { decodeRow, encodeRow, type RuleRow } from "./ruleRowCodec";

export type RuleEditorValues = {
	name: string;
	subjects: RuleSubject[];
	actions: ApprovalAction[];
	/** Balances' Feature, set once above the groups. */
	pinned: RuleRow | null;
	groups: FilterRowGroup<RuleRow["field"], RuleRow["operator"]>[];
	note: string;
	enabled: boolean;
};

export type EditorValuesResult =
	| { ok: true; params: CreateApprovalRuleParams }
	| { ok: false; issues: EditorRowIssue[] };

const emptyPinned = (area: WhenKey | null): RuleRow | null => {
	const field = area && PINNED_FIELDS[area];
	return field ? { field, operator: "is", values: [] } : null;
};

/** Fresh When values for these actions: no groups, and an empty Feature row for Balances. */
export const whenValuesFor = ({ actions }: { actions: ApprovalAction[] }) => ({
	pinned: emptyPinned(ruleWhenArea({ actions })),
	groups: [],
});

export const emptyEditorValues = (): RuleEditorValues => ({
	name: "",
	subjects: [],
	actions: [],
	pinned: null,
	groups: [],
	note: "",
	enabled: true,
});

/** `editable: false` when the stored `when` can't be shown as rows; the sheet opens read-only. */
export const ruleToEditorValues = ({ rule }: { rule: ApprovalRule }) => {
	const values: RuleEditorValues = {
		...emptyEditorValues(),
		name: rule.name,
		subjects: rule.subjects,
		actions: rule.actions,
		note: rule.note ?? "",
		enabled: rule.enabled,
	};
	const area = ruleWhenArea({ actions: rule.actions });
	if (!area) return { editable: rule.when === null, values };

	const rows = whenToRows({ area, when: rule.when });
	if (!rows.editable) return { editable: false, values };
	return {
		editable: true,
		values: {
			...values,
			pinned: rows.pinned ? encodeRow(rows.pinned) : emptyPinned(area),
			groups: rows.groups.map((group) => ({ rules: group.map(encodeRow) })),
		},
	};
};

export const editorValuesToParams = ({
	values,
}: {
	values: RuleEditorValues;
}): EditorValuesResult => {
	const area = ruleWhenArea({ actions: values.actions });
	const when = area
		? rowsToWhen({
				area,
				pinned: values.pinned && decodeRow(values.pinned),
				groups: values.groups.map((group) => group.rules.map(decodeRow)),
			})
		: { ok: true as const, when: null };
	if (!when.ok) return when;

	return {
		ok: true,
		params: {
			name: values.name.trim(),
			subjects: values.subjects,
			actions: values.actions,
			when: when.when,
			note: values.note.trim() || null,
			enabled: values.enabled,
		},
	};
};
