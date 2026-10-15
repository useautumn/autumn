import type { ApprovalRule } from "@autumn/shared";
import { useState } from "react";

/** Which rule dialog is open; the nonce remounts the editor so each open starts fresh. */
export const useRuleDialogs = () => {
	const [state, setState] = useState({
		dialog: null as "editor" | "delete" | null,
		rule: null as ApprovalRule | null,
		nonce: 0,
	});
	const open = (dialog: "editor" | "delete", rule: ApprovalRule | null) =>
		setState((prev) => ({ dialog, rule, nonce: prev.nonce + 1 }));

	return {
		...state,
		openEditor: ({ rule }: { rule: ApprovalRule | null }) =>
			open("editor", rule),
		openDelete: ({ rule }: { rule: ApprovalRule }) => open("delete", rule),
		setOpen: (isOpen: boolean) =>
			isOpen || setState((prev) => ({ ...prev, dialog: null })),
	};
};
