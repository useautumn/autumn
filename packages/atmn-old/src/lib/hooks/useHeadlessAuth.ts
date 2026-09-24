import { useCallback, useEffect, useRef, useState } from "react";
import { CLI_CLIENT_ID } from "../../commands/auth/constants.js";
import {
	getApiKeysWithToken,
	startOAuthFlow,
} from "../../commands/auth/oauth.js";
import { fetchOrganizationMe } from "../api/endpoints/index.js";
import { readFromEnv } from "../utils.js";
import { storeEnvKeys } from "./useEnvironmentStore.js";

export interface OrgInfo {
	name: string;
	slug: string;
}

export type HeadlessAuthState =
	| "checking"
	| "not_authenticated"
	| "authenticating"
	| "authenticated"
	| "error";

export interface UseHeadlessAuthOptions {
	onComplete?: (orgInfo: OrgInfo) => void;
	headless?: boolean;
}

export interface UseHeadlessAuthReturn {
	authState: HeadlessAuthState;
	orgInfo: OrgInfo | null;
	error: string | null;
}

export function useHeadlessAuth(
	options?: UseHeadlessAuthOptions,
): UseHeadlessAuthReturn {
	const { onComplete, headless = false } = options ?? {};

	const [authState, setAuthState] = useState<HeadlessAuthState>("checking");
	const [orgInfo, setOrgInfo] = useState<OrgInfo | null>(null);
	const [error, setError] = useState<string | null>(null);
	const hasStarted = useRef(false);
	const isCompleted = useRef(false);

	const performAuth = useCallback(async () => {
		setAuthState("authenticating");

		try {
			const { tokens } = await startOAuthFlow(CLI_CLIENT_ID, { headless });
			const { sandboxKey, prodKey } = await getApiKeysWithToken(
				tokens.access_token,
			);

			// Use storeEnvKeys (non-interactive) instead of storeToEnv (interactive)
			await storeEnvKeys({ prodKey, sandboxKey }, { forceOverwrite: true });

			// Fetch org info with new key
			const info = await fetchOrganizationMe({ secretKey: sandboxKey });
			setOrgInfo(info);
			setAuthState("authenticated");

			if (!isCompleted.current && onComplete) {
				isCompleted.current = true;
				onComplete(info);
			}
		} catch (err) {
			setError(err instanceof Error ? err.message : "Authentication failed");
			setAuthState("error");
		}
	}, [headless, onComplete]);

	useEffect(() => {
		if (hasStarted.current) return;
		hasStarted.current = true;

		const checkAuth = async () => {
			try {
				const apiKey = readFromEnv({ bypass: true });

				if (!apiKey) {
					setAuthState("not_authenticated");
					await performAuth();
					return;
				}

				// Verify the key works by fetching org info
				const info = await fetchOrganizationMe({ secretKey: apiKey });
				setOrgInfo(info);
				setAuthState("authenticated");

				if (!isCompleted.current && onComplete) {
					isCompleted.current = true;
					onComplete(info);
				}
			} catch {
				// Key exists but is invalid
				setAuthState("not_authenticated");
				await performAuth();
			}
		};

		checkAuth();
	}, [performAuth, onComplete]);

	return { authState, orgInfo, error };
}
