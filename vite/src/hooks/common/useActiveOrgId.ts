import { useEffect } from "react";
import { useSession } from "@/lib/auth-client";

const HINT_KEY = "autumn_session_org_hint";

const readHint = () => {
	try {
		return localStorage.getItem(HINT_KEY) ?? undefined;
	} catch {
		return undefined;
	}
};

const writeHint = (orgId: string | undefined) => {
	try {
		if (orgId) localStorage.setItem(HINT_KEY, orgId);
		else localStorage.removeItem(HINT_KEY);
	} catch {}
};

/**
 * The session's active org, or the last one we saw while the session request
 * is in flight, so org-scoped queries can start (and read cache) immediately.
 */
export const useActiveOrgId = () => {
	const { data: session, isPending: sessionPending } = useSession();
	const sessionOrgId = session?.session.activeOrganizationId ?? undefined;

	useEffect(() => {
		if (sessionPending || readHint() === sessionOrgId) return;
		writeHint(sessionOrgId);
	}, [sessionPending, sessionOrgId]);

	return {
		activeOrgId: sessionPending ? readHint() : sessionOrgId,
		sessionPending,
	};
};
