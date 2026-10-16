import { useState } from "react";
import { useAppForm } from "@/hooks/form/form";
import {
	type ApprovalRuleIssue,
	invalidRuleIssues,
	useSaveApprovalRule,
} from "@/hooks/queries/useApprovalRulesMutations";
import type { ApprovalAction, ApprovalRule } from "../approvalsStub";
import { ruleFilterKey } from "./ruleActions";
import {
	editorValuesToParams,
	emptyEditorValues,
	ruleToEditorValues,
	whenValuesFor,
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
		defaultValues: rule
			? ruleToEditorValues({ rule }).values
			: emptyEditorValues(),
		onSubmit: async ({ value }) => {
			const result = editorValuesToParams({ values: value });
			if (!result.ok) return;
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
		/** The first server issue under `path` ("name", "filter"…), for inline display. */
		serverIssue: (path: string) =>
			serverIssues.find(
				(issue) => issue.path === path || issue.path.startsWith(`${path}.`),
			)?.message,
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
