import { useMutationState } from "@tanstack/react-query";
import { createContext, type ReactNode, use } from "react";
import { BILLING_MUTATION_KEY } from "../hooks/useBillingMutation";
import { resolvePermissionDenial } from "./resolvePermissionDenial";

type ResolvedPermissionDenial = ReturnType<typeof resolvePermissionDenial>;

const PermissionDenialContext = createContext<ResolvedPermissionDenial>(null);

export const usePermissionDenial = () => use(PermissionDenialContext);

/** Resolves the sheet's denial once from its preview and its latest failed submit. */
export function PermissionDenialProvider({
	preview,
	children,
}: {
	preview: unknown;
	children: ReactNode;
}) {
	const submitErrors = useMutationState({
		filters: { mutationKey: BILLING_MUTATION_KEY, status: "error" },
		select: (mutation) => mutation.state.error,
	});
	const value = resolvePermissionDenial({
		preview,
		error: submitErrors.at(-1),
	});

	return (
		<PermissionDenialContext value={value}>{children}</PermissionDenialContext>
	);
}
