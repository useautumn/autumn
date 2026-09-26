import { makeScopeChecker } from "@autumn/shared";
import { useEffect, useMemo } from "react";
import { useSession } from "@/lib/auth-client";

const CACHED_SCOPES_KEY = "autumn.scopes";

const readCachedScopes = (): string[] => {
	try {
		const cached = window.localStorage.getItem(CACHED_SCOPES_KEY);
		return cached ? (JSON.parse(cached) as string[]) : [];
	} catch {
		return [];
	}
};

const writeCachedScopes = (scopes: string[]) => {
	try {
		window.localStorage.setItem(CACHED_SCOPES_KEY, JSON.stringify(scopes));
	} catch {}
};

/**
 * React wrapper around `makeScopeChecker` that reads scopes from the
 * current dashboard session. Scopes are injected onto the session by the
 * `customSession` better-auth plugin (see `server/src/utils/auth.ts`).
 *
 * Returns the same shape as `makeScopeChecker`:
 *   `{ expanded, isAdmin, isSuperuser, has, hasAny, hasAll, check }`
 */
export function useScopes() {
	const { data: session, isPending } = useSession();
	const sessionScopes = (session as any)?.scopes as string[] | undefined;

	// Last known scopes let gated UI render instantly while the session loads.
	useEffect(() => {
		if (!isPending) writeCachedScopes(sessionScopes ?? []);
	}, [isPending, sessionScopes]);

	return useMemo(() => {
		const raw =
			isPending && !session ? readCachedScopes() : (sessionScopes ?? []);
		return makeScopeChecker(raw);
	}, [isPending, session, sessionScopes]);
}
