import type {
	ApprovalAction,
	ApprovalRule,
	ApprovalRuleIssue,
} from "@autumn/shared";
import type { EditorRowIssue } from "@autumn/shared/api/approvals/editor/index";
import { useState } from "react";
import { useAppForm } from "@/hooks/form/form";
import { useSaveApprovalRule } from "@/hooks/queries/useApprovalRulesMutations";
import { invalidRuleIssues } from "./invalidRuleIssues";
import { ruleWhenArea } from "./ruleActions";
import {
	editorValuesToParams,
	emptyEditorValues,
	ruleToEditorValues,
	whenValuesFor,
} from "./ruleEditorValues";

const matchesPath = ({
	issue,
	path,
}: {
	issue: ApprovalRuleIssue;
	path: string;
}) => issue.path === path || issue.path.startsWith(`${path}.`);

const PINNED_PATH = "when.feature_id";

export const useApprovalRuleForm = ({
	rule,
	onSaved,
}: {
	rule: ApprovalRule | null;
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
		issues.server.find((issue) => matchesPath({ issue, path }))?.message;
	const serverPinned = serverIssue(PINNED_PATH);

	return {
		form,
		readOnly: !opened.editable,
		isSaving: save.isPending,
		serverIssue,
		whenError: issues.server.find(
			(issue) =>
				matchesPath({ issue, path: "when" }) && issue.path !== PINNED_PATH,
		)?.message,
		rowIssues: serverPinned
			? [
					...issues.rows,
					{ group: "pinned" as const, row: 0, message: serverPinned },
				]
			: issues.rows,
		clearRowIssues: () => setIssues((prev) => ({ ...prev, rows: [] })),
		/** A different set of `when` fields starts the conditions over; old ones wouldn't fit. */
		changeActions: ({
			current,
			actions,
		}: {
			current: ApprovalAction[];
			actions: ApprovalAction[];
		}) => {
			if (ruleWhenArea({ actions }) !== ruleWhenArea({ actions: current })) {
				const { pinned, groups } = whenValuesFor({ actions });
				form.setFieldValue("pinned", pinned);
				form.setFieldValue("groups", groups);
			}
			form.setFieldValue("actions", actions);
		},
	};
};
