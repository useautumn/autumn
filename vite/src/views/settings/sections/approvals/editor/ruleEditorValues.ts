import type {
	ApprovalAction,
	ApprovalRule,
	CreateApprovalRuleParams,
	RuleSubject,
	WhenKey,
} from "@autumn/shared";
import {
	type EditorRowIssue,
	PINNED_FIELDS,
	rowsToWhen,
	whenToRows,
} from "@autumn/shared/api/approvals/editor/index";
import { isDeferredAction, ruleWhenArea } from "./ruleActions";
import { decodeRow, encodeRow, type RuleRow } from "./ruleRowCodec";

/** Rows and groups carry an id so React keeps each one's inputs as others are removed. */
export type RuleRowItem = RuleRow & { id: string };
export type RuleGroup = { id: string; rules: RuleRowItem[] };

export const withId = <Item extends object>(item: Item) => ({
	...item,
	id: crypto.randomUUID(),
});

export type RuleEditorValues = {
	name: string;
	subjects: RuleSubject[];
	actions: ApprovalAction[];
	/** Balances' Feature, set once above the groups. */
	pinned: RuleRow | null;
	groups: RuleGroup[];
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
	if (rule.actions.some(isDeferredAction)) return { editable: false, values };
	const area = ruleWhenArea({ actions: rule.actions });
	if (!area) return { editable: rule.when === null, values };

	const rows = whenToRows({ area, when: rule.when });
	if (!rows.editable) return { editable: false, values };
	return {
		editable: true,
		values: {
			...values,
			pinned: rows.pinned ? encodeRow(rows.pinned) : emptyPinned(area),
			groups: rows.groups.map((group) =>
				withId({ rules: group.map((row) => withId(encodeRow(row))) }),
			),
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
