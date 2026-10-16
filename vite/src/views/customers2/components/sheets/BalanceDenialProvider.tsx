import type { ReactNode } from "react";
import { PermissionDenialProvider } from "@/components/forms/shared/permission/PermissionDenialContext";
import { BALANCE_DENIAL_SECTIONS, BALANCE_WRITE_KEY } from "./useBalanceWrite";

/** Balance writes have no preview, so only a failed write's 403 shows. */
export function BalanceDenialProvider({ children }: { children: ReactNode }) {
	return (
		<PermissionDenialProvider
			preview={undefined}
			mutationKey={BALANCE_WRITE_KEY}
			sections={BALANCE_DENIAL_SECTIONS}
		>
			{children}
		</PermissionDenialProvider>
	);
}
