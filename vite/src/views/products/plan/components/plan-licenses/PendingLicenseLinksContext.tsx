import type { PlanLicense } from "@autumn/shared";
import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useMemo,
	useState,
} from "react";

/**
 * Licenses linked from the toolbar but not yet persisted. Linking only stages
 * an id here; the card it produces registers as dirty so the plan save bar
 * appears, and the link is created server-side when that save runs (or dropped
 * on discard). Plain page-scoped state: leaving the plan editor unmounts the
 * provider, so staged links are abandoned with it.
 */
interface PendingLicenseLinksValue {
	pendingLicenseIds: string[];
	addPendingLink: (licenseId: string) => void;
	removePendingLink: (licenseId: string) => void;
}

const PendingLicenseLinksContext = createContext<PendingLicenseLinksValue>({
	pendingLicenseIds: [],
	addPendingLink: () => {},
	removePendingLink: () => {},
});

export function PendingLicenseLinksProvider({
	children,
}: {
	children: ReactNode;
}) {
	const [pendingLicenseIds, setPendingLicenseIds] = useState<string[]>([]);

	const addPendingLink = useCallback((licenseId: string) => {
		setPendingLicenseIds((prev) =>
			prev.includes(licenseId) ? prev : [...prev, licenseId],
		);
	}, []);

	const removePendingLink = useCallback((licenseId: string) => {
		setPendingLicenseIds((prev) => prev.filter((id) => id !== licenseId));
	}, []);

	const value = useMemo(
		() => ({ pendingLicenseIds, addPendingLink, removePendingLink }),
		[pendingLicenseIds, addPendingLink, removePendingLink],
	);

	return (
		<PendingLicenseLinksContext.Provider value={value}>
			{children}
		</PendingLicenseLinksContext.Provider>
	);
}

export const usePendingLicenseLinks = () =>
	useContext(PendingLicenseLinksContext);

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
	included_quantity: 1,
	allow_extra_quantity: false,
	pooled_feature_ids: [],
	customize: null,
	metadata: null,
	created_at: Date.now(),
	updated_at: Date.now(),
});
