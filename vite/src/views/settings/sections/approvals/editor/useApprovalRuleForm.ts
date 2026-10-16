import type {
	ApprovalAction,
	ApprovalRule,
	ApprovalRuleIssue,
} from "@autumn/shared";
import type { EditorRowIssue } from "@autumn/shared/api/approvals/editor/index";
import { useState } from "react";
import { useAppForm } from "@/hooks/form/form";
import {
	invalidRuleIssues,
	useSaveApprovalRule,
} from "@/hooks/queries/useApprovalRulesMutations";
import type { ReadOnlyReason } from "./ReadOnlyNotice";
import { ruleFilterKey } from "./ruleActions";
import {
	editorValuesToParams,
	emptyEditorValues,
	ruleToEditorValues,
	whenValuesFor,
} from "./ruleEditorValues";

// Fields the sheet shows issues under; anything else (an unknown key) still needs to be seen.
const FIELD_PATHS = [
	"name",
	"subjects",
	"effect",
	"actions",
	"filter",
	"note",
	"enabled",
];

const isUnder = ({ path, field }: { path: string; field: string }) =>
	path === field || path.startsWith(`${field}.`);

export const unplacedIssue = ({ issues }: { issues: ApprovalRuleIssue[] }) =>
	issues.find(
		(issue) =>
			!FIELD_PATHS.some((field) => isUnder({ path: issue.path, field })),
	)?.message;

const PINNED_PATH = "filter.feature_id";

const readOnlyReason = ({
	canEdit,
	editable,
}: {
	canEdit: boolean;
	editable: boolean;
}): ReadOnlyReason | null => {
	if (!canEdit) return "not_editor";
	return editable ? null : "shape";
};

export const useApprovalRuleForm = ({
	rule,
	canEdit,
	onSaved,
}: {
	rule: ApprovalRule | null;
	canEdit: boolean;
	onSaved: () => void;
}) => {
	const save = useSaveApprovalRule();
	const [opened] = useState(() =>
		rule
			? ruleToEditorValues({ rule })
			: { editable: true, values: emptyEditorValues() },
	);
	const [issues, setIssues] = useState<{
		server: ApprovalRuleIssue[];
		rows: EditorRowIssue[];
	}>({ server: [], rows: [] });

	const form = useAppForm({
		defaultValues: opened.values,
		onSubmit: async ({ value }) => {
			const result = editorValuesToParams({ values: value });
			if (!result.ok) return setIssues({ server: [], rows: result.issues });
			setIssues({ server: [], rows: [] });
			try {
				await save.mutateAsync({ id: rule?.id ?? null, params: result.params });
				onSaved();
			} catch (error) {
				setIssues({ server: invalidRuleIssues({ error }) ?? [], rows: [] });
			}
		},
	});

	const serverIssue = (path: string) =>
		issues.server.find((issue) => isUnder({ path: issue.path, field: path }))
			?.message;
	const serverPinned = serverIssue(PINNED_PATH);

	return {
		form,
		readOnly: readOnlyReason({ canEdit, editable: opened.editable }),
		/** False when the stored filter can't be shown as rows, whoever is looking. */
		showsRows: opened.editable,
		isSaving: save.isPending,
		serverIssue,
		filterError: issues.server.find(
			(issue) =>
				isUnder({ path: issue.path, field: "filter" }) &&
				issue.path !== PINNED_PATH,
		)?.message,
		rowIssues: serverPinned
			? [
					...issues.rows,
					{ group: "pinned" as const, row: 0, message: serverPinned },
				]
			: issues.rows,
		clearRowIssues: () => setIssues((prev) => ({ ...prev, rows: [] })),
		unplacedIssue: unplacedIssue({ issues: issues.server }),
		/** A different filter shape starts the conditions over; old ones wouldn't fit. */
		changeActions: ({
			current,
			actions,
		}: {
			current: ApprovalAction[];
			actions: ApprovalAction[];
		}) => {
			if (ruleFilterKey({ actions }) !== ruleFilterKey({ actions: current })) {
				const { pinned, groups } = whenValuesFor({ actions });
				form.setFieldValue("pinned", pinned);
				form.setFieldValue("groups", groups);
			}
			form.setFieldValue("actions", actions);
		},
	};
};
