import type {
	ApprovalAction,
	ApprovalFilterKey,
	ApprovalRule,
	ApprovalRuleEffect,
	ApprovalRuleFilter,
	CreateApprovalRuleParams,
	RuleSubject,
} from "@autumn/shared";
import { ACTIONS } from "@autumn/shared";
import {
	type EditorRowIssue,
	PINNED_FIELDS,
	ruleFilterToRows,
	ruleRowsToFilter,
} from "@autumn/shared/api/approvals/editor/index";
import { ruleFilterKey } from "./ruleActions";
import { decodeRow, encodeRow, type RuleRow } from "./ruleRowCodec";

/** Rows and groups carry an id so React keeps each one's inputs as others are removed. */
export type RuleRowItem = RuleRow & { id: string };
export type RuleGroup = { id: string; rules: RuleRowItem[] };

export const withId = <Item extends object>(item: Item) => ({
	...item,
	id: crypto.randomUUID(),
});

/** Rows carry no effect; the quantifiers are chosen from `effect` on save. */
export type RuleEditorValues = {
	name: string;
	effect: ApprovalRuleEffect;
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

const emptyPinned = (shape: ApprovalFilterKey | null): RuleRow | null => {
	const field = shape && PINNED_FIELDS[shape];
	return field ? { field, operator: "is", values: [] } : null;
};

/** Fresh When values for these actions: no groups, and an empty Feature row for Balances. */
export const whenValuesFor = ({ actions }: { actions: ApprovalAction[] }) => ({
	pinned: emptyPinned(ruleFilterKey({ actions })),
	groups: [],
});

export const emptyEditorValues = (): RuleEditorValues => ({
	name: "",
	effect: "block",
	subjects: [],
	actions: [],
	pinned: null,
	groups: [],
	note: "",
	enabled: true,
});

/** `editable: false` when the stored filter can't be shown as rows; the sheet opens read-only. */
export const ruleToEditorValues = ({ rule }: { rule: ApprovalRule }) => {
	const values: RuleEditorValues = {
		...emptyEditorValues(),
		name: rule.name,
		effect: rule.effect,
		subjects: rule.subjects,
		actions: rule.actions,
		note: rule.note ?? "",
		enabled: rule.enabled,
	};
	// Ids S3 no longer lists (deferred member actions, old names) can't be edited.
	if (rule.actions.some((action) => !(action in ACTIONS))) {
		return { editable: false, values };
	}
	const shape = ruleFilterKey({ actions: rule.actions });
	if (!shape) return { editable: rule.filter === null, values };

	const rows = ruleFilterToRows({
		shape,
		effect: rule.effect,
		filter: rule.filter,
	});
	if (!rows.editable) return { editable: false, values };
	return {
		editable: true,
		values: {
			...values,
			pinned: rows.pinned ? encodeRow(rows.pinned) : emptyPinned(shape),
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
	const shape = ruleFilterKey({ actions: values.actions });
	const stored = shape
		? ruleRowsToFilter({
				shape,
				effect: values.effect,
				pinned: values.pinned && decodeRow(values.pinned),
				groups: values.groups.map((group) => group.rules.map(decodeRow)),
			})
		: { ok: true as const, filter: null };
	if (!stored.ok) return stored;

	return {
		ok: true,
		params: {
			name: values.name.trim(),
			effect: values.effect,
			subjects: values.subjects,
			actions: values.actions,
			filter: stored.filter as ApprovalRuleFilter | null,
			note: values.note.trim() || null,
			enabled: values.enabled,
		},
	};
};
