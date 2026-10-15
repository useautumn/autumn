import type {
	ApprovalAction,
	ApprovalRule,
	ApprovalRuleIssue,
} from "@autumn/shared";
import { useState } from "react";
import { useAppForm } from "@/hooks/form/form";
import {
	invalidRuleIssues,
	useSaveApprovalRule,
} from "@/hooks/queries/useApprovalRulesMutations";
import { ruleWhenArea } from "./ruleActions";
import {
	editorValuesToParams,
	emptyEditorValues,
	ruleToEditorValues,
} from "./ruleEditorValues";

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
		/** The first server issue under `path` ("name", "when"…), for inline display. */
		serverIssue: (path: string) =>
			serverIssues.find(
				(issue) => issue.path === path || issue.path.startsWith(`${path}.`),
			)?.message,
		/** A different set of `when` fields drops the old conditions; they wouldn't fit. */
		changeActions: ({
			current,
			actions,
		}: {
			current: ApprovalAction[];
			actions: ApprovalAction[];
		}) => {
			if (ruleWhenArea({ actions }) !== ruleWhenArea({ actions: current })) {
				form.setFieldValue("when", null);
			}
			form.setFieldValue("actions", actions);
		},
	};
};
