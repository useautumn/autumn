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
			serverIssues.find((issue) => isUnder({ path: issue.path, field: path }))
				?.message,
		unplacedIssue: unplacedIssue({ issues: serverIssues }),
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
