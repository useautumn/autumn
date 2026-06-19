import { authClient } from "@/lib/auth-client";

const LAST_ORG_KEY = "autumn_last_active_org_id";

export const setLastSwitchedOrgId = (id: string) => {
	try {
		localStorage.setItem(LAST_ORG_KEY, id);
	} catch {}
};

export const getLastSwitchedOrgId = (): string | null => {
	try {
		return localStorage.getItem(LAST_ORG_KEY);
	} catch {
		return null;
	}
};

export const clearLastSwitchedOrgId = (id?: string) => {
	try {
		if (!id || localStorage.getItem(LAST_ORG_KEY) === id) {
			localStorage.removeItem(LAST_ORG_KEY);
		}
	} catch {}
};

// Single source of truth for changing the active org: always mirrors the
// server-side switch into localStorage so DashboardGate can't read a stale
// lastOrgId and bounce back. Use this instead of authClient.organization.setActive.
export const setActiveOrg = async (orgId: string) => {
	const result = await authClient.organization.setActive({
		organizationId: orgId,
	});
	setLastSwitchedOrgId(orgId);
	return result;
};
