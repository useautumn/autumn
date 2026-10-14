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

export const clearCachedScopes = () => {
	try {
		window.localStorage.removeItem(CACHED_SCOPES_KEY);
	} catch {}
};

export function useScopes() {
	const { data: session, isPending } = useSession();
	const sessionScopes = (session as any)?.scopes as string[] | undefined;

	useEffect(() => {
		if (!isPending) writeCachedScopes(sessionScopes ?? []);
	}, [isPending, sessionScopes]);

	return useMemo(() => {
		const raw =
			isPending && !session ? readCachedScopes() : (sessionScopes ?? []);
		return makeScopeChecker(raw);
	}, [isPending, session, sessionScopes]);
}
