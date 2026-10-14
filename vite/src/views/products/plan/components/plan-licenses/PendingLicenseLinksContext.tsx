import type { PlanLicense } from "@autumn/shared";
import { createContext, type ReactNode, useContext, useId } from "react";
import { create } from "zustand";

interface PendingLicenseLinksState {
	linksByScope: Record<string, string[]>;
	add: (scope: string, licenseId: string) => void;
	remove: (scope: string, licenseId: string) => void;
}

const usePendingLicenseLinksStore = create<PendingLicenseLinksState>((set) => ({
	linksByScope: {},
	add: (scope, licenseId) =>
		set((s) => {
			const links = s.linksByScope[scope] ?? [];
			if (links.includes(licenseId)) return s;
			return {
				linksByScope: { ...s.linksByScope, [scope]: [...links, licenseId] },
			};
		}),
	remove: (scope, licenseId) =>
		set((s) => ({
			linksByScope: {
				...s.linksByScope,
				[scope]: (s.linksByScope[scope] ?? []).filter((id) => id !== licenseId),
			},
		})),
}));

const EMPTY_LINKS: string[] = [];

const PendingLicenseScopeContext = createContext<string | null>(null);

export function PendingLicenseLinksProvider({
	scope,
	children,
}: {
	scope?: string;
	children: ReactNode;
}) {
	const instanceScope = useId();
	return (
		<PendingLicenseScopeContext.Provider value={scope ?? instanceScope}>
			{children}
		</PendingLicenseScopeContext.Provider>
	);
}

export const usePendingLicenseLinks = () => {
	const scope = useContext(PendingLicenseScopeContext);
	const pendingLicenseIds = usePendingLicenseLinksStore((s) =>
		scope ? (s.linksByScope[scope] ?? EMPTY_LINKS) : EMPTY_LINKS,
	);
	const add = usePendingLicenseLinksStore((s) => s.add);
	const remove = usePendingLicenseLinksStore((s) => s.remove);

	return {
		pendingLicenseIds,
		addPendingLink: (licenseId: string) => {
			if (scope) add(scope, licenseId);
		},
		removePendingLink: (licenseId: string) => {
			if (scope) remove(scope, licenseId);
		},
	};
};

export const pendingPlanLicense = ({
	licenseId,
	parentPlanId,
}: {
	licenseId: string;
	parentPlanId: string;
}): PlanLicense => ({
	id: `pending-${licenseId}`,
	parent_plan_id: parentPlanId,
	license_plan_id: licenseId,
	included: 0,
	prepaid_only: true,
	customize: null,
	metadata: null,
	created_at: Date.now(),
	updated_at: Date.now(),
});
