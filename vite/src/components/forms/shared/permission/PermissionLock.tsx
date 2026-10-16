import type { ReactNode } from "react";
import { PermissionDenial } from "./PermissionDenial";
import { usePermissionDenial } from "./PermissionDenialContext";

/** Puts the denial summary above a footer; a disabled fieldset locks every action in it. */
export function PermissionLock({ children }: { children: ReactNode }) {
	const permission = usePermissionDenial();
	if (!permission) return children;

	return (
		<>
			<div className="px-4 pt-4">
				<PermissionDenial section="summary" />
			</div>
			<fieldset disabled={permission.locksSubmit} className="contents">
				{children}
			</fieldset>
		</>
	);
}
