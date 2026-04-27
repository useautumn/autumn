import { useMemo } from "react";
import { useSession } from "@/lib/auth-client";
import { makeScopeChecker } from "@autumn/shared";

/**
 * React wrapper around `makeScopeChecker` that reads scopes from the
 * current dashboard session. Scopes are injected onto the session by the
 * `customSession` better-auth plugin (see `server/src/utils/auth.ts`).
 *
 * Returns the same shape as `makeScopeChecker`:
 *   `{ expanded, isAdmin, isSuperuser, has, hasAny, hasAll, check }`
 */
export function useScopes() {
	const { data: session } = useSession();

	return useMemo(() => {
		const raw = ((session as any)?.scopes ?? []) as string[];
		return makeScopeChecker(raw);
	}, [session]);
}
