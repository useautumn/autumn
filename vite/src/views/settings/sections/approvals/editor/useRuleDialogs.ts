import type { ApprovalRule } from "@autumn/shared";
import { useState } from "react";

type RuleDialog = "editor" | "delete" | null;

/** Which rule dialog is open; the nonce remounts the editor so each open starts fresh. */
export const useRuleDialogs = () => {
	const [state, setState] = useState<{
		dialog: RuleDialog;
		rule: ApprovalRule | null;
		nonce: number;
	}>({ dialog: null, rule: null, nonce: 0 });

	const open = ({
		dialog,
		rule,
	}: {
		dialog: RuleDialog;
		rule: ApprovalRule | null;
	}) => setState((prev) => ({ dialog, rule, nonce: prev.nonce + 1 }));

	return {
		...state,
		openEditor: ({ rule }: { rule: ApprovalRule | null }) =>
			open({ dialog: "editor", rule }),
		openDelete: ({ rule }: { rule: ApprovalRule }) =>
			open({ dialog: "delete", rule }),
		setOpen: (isOpen: boolean) => {
			if (!isOpen) setState((prev) => ({ ...prev, dialog: null }));
		},
	};
};

export type RuleDialogs = ReturnType<typeof useRuleDialogs>;
