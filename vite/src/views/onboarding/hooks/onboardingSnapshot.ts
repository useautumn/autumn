import type { OnboardingStatus } from "@autumn/shared";
import { getLastSwitchedOrgId } from "@/lib/orgSync";

const SNAPSHOT_KEY = "autumn_onboarding_status";
const DISMISSED_KEY = "autumn_products_onboarding_dismissed";

/** Read outside React by the route redirect, which runs before the hook does. */
export const readDismissed = (): boolean => {
	if (typeof window === "undefined") return false;
	try {
		return localStorage.getItem(DISMISSED_KEY) === "true";
	} catch {
		return false;
	}
};

export const setDismissed = ({ dismissed }: { dismissed: boolean }) => {
	try {
		if (dismissed) localStorage.setItem(DISMISSED_KEY, "true");
		else localStorage.removeItem(DISMISSED_KEY);
	} catch {
		// Losing the flag only costs us a re-shown card.
	}
};

/**
 * The org id available during the very first render. `useOrg` resolves a beat
 * later, so keying on it would miss the cache on exactly the paint we're trying
 * to keep stable.
 */
const snapshotKey = ({ env }: { env: string }) =>
	`${SNAPSHOT_KEY}:${getLastSwitchedOrgId() ?? "unknown"}:${env}`;

/** Last known status, read synchronously so the first paint is already correct. */
export const readSnapshot = ({
	env,
}: {
	env: string;
}): OnboardingStatus | null => {
	if (typeof window === "undefined") return null;
	try {
		const raw = localStorage.getItem(snapshotKey({ env }));
		return raw ? (JSON.parse(raw) as OnboardingStatus) : null;
	} catch {
		return null;
	}
};

export const writeSnapshot = ({
	env,
	status,
}: {
	env: string;
	status: OnboardingStatus;
}) => {
	if (typeof window === "undefined") return;
	try {
		localStorage.setItem(snapshotKey({ env }), JSON.stringify(status));
	} catch {
		// A full or blocked localStorage only costs us the anti-flicker cache.
	}
};
