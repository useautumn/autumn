import type { ApprovalRule, ApprovalRuleIssue } from "@autumn/shared";
import { useState } from "react";
import { useAppForm } from "@/hooks/form/form";
import { useSaveApprovalRule } from "@/hooks/queries/useApprovalRulesMutations";
import { invalidRuleIssues } from "./invalidRuleIssues";
import {
	editorValuesToParams,
	emptyEditorValues,
	ruleToEditorValues,
} from "./ruleEditorValues";

/** The first server issue under `path` ("name", "actions", "when"…), for inline display. */
const issueAt = ({
	issues,
	path,
}: {
	issues: ApprovalRuleIssue[];
	path: string;
}) =>
	issues.find(
		(issue) => issue.path === path || issue.path.startsWith(`${path}.`),
	)?.message;

export const useApprovalRuleForm = ({
	rule,
	onSaved,
}: {
	rule: ApprovalRule | null;
	onSaved: () => void;
}) => {
	const save = useSaveApprovalRule();
	const [serverIssues, setServerIssues] = useState<ApprovalRuleIssue[]>([]);

	const form = useAppForm({
		defaultValues: rule ? ruleToEditorValues({ rule }) : emptyEditorValues(),
		onSubmit: async ({ value }) => {
			const result = editorValuesToParams({ values: value });
			setServerIssues([]);
			try {
				await save.mutateAsync({ id: rule?.id ?? null, params: result.params });
				onSaved();
			} catch (error) {
				setServerIssues(invalidRuleIssues({ error }) ?? []);
			}
		},
	});

	return {
		form,
		isSaving: save.isPending,
		serverIssue: (path: string) => issueAt({ issues: serverIssues, path }),
	};
};

export type ApprovalRuleForm = ReturnType<typeof useApprovalRuleForm>["form"];
