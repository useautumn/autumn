import { type MutationKey, useMutationState } from "@tanstack/react-query";
import { createContext, type ReactNode, use } from "react";
import { BILLING_MUTATION_KEY } from "../hooks/useBillingMutation";
import {
	BILLING_DENIAL_SECTIONS,
	type PermissionSections,
} from "./billingDenialSections";
import { resolvePermissionDenial } from "./resolvePermissionDenial";

type PermissionDenialValue =
	| (NonNullable<ReturnType<typeof resolvePermissionDenial>> & {
			sections: PermissionSections;
	  })
	| null;

const PermissionDenialContext = createContext<PermissionDenialValue>(null);

export const usePermissionDenial = () => use(PermissionDenialContext);

/** Resolves the sheet's denial once from its preview and its latest failed submit. */
export function PermissionDenialProvider({
	preview,
	mutationKey = BILLING_MUTATION_KEY,
	sections = BILLING_DENIAL_SECTIONS,
	children,
}: {
	preview: unknown;
	/** The sheet's submit mutations; billing writes by default. */
	mutationKey?: MutationKey;
	sections?: PermissionSections;
	children: ReactNode;
}) {
	const submitErrors = useMutationState({
		filters: { mutationKey, status: "error" },
		select: (mutation) => mutation.state.error,
	});
	const resolved = resolvePermissionDenial({
		preview,
		error: submitErrors.at(-1),
	});
	const value = resolved && { ...resolved, sections };

	return (
		<PermissionDenialContext value={value}>{children}</PermissionDenialContext>
	);
}
