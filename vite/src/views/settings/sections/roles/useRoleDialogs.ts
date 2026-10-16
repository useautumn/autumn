import { useState } from "react";
import type { ApiRole } from "./roleAccess";

type RoleDialog = "editor" | "delete" | null;

/** Which role dialog is open; the nonce remounts the editor so each open starts fresh. */
export const useRoleDialogs = () => {
	const [state, setState] = useState<{
		dialog: RoleDialog;
		role: ApiRole | null;
		nonce: number;
	}>({ dialog: null, role: null, nonce: 0 });

	const open = ({
		dialog,
		role,
	}: {
		dialog: RoleDialog;
		role: ApiRole | null;
	}) => setState((prev) => ({ dialog, role, nonce: prev.nonce + 1 }));

	const setOpen = (isOpen: boolean) => {
		if (isOpen) return;
		setState((prev) => ({ ...prev, dialog: null }));
	};

	return {
		...state,
		openEditor: ({ role }: { role: ApiRole | null }) =>
			open({ dialog: "editor", role }),
		openDelete: ({ role }: { role: ApiRole }) =>
			open({ dialog: "delete", role }),
		setOpen,
	};
};

export type RoleDialogs = ReturnType<typeof useRoleDialogs>;
