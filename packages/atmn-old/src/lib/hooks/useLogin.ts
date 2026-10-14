import { useMutation } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { CLI_CLIENT_ID } from "../../commands/auth/constants.js";
import {
	getApiKeysWithToken,
	startOAuthFlow,
} from "../../commands/auth/oauth.js";
import { fetchOrganizationMe } from "../api/endpoints/index.js";
import { readFromEnv } from "../utils.js";
import { storeEnvKeys } from "./useEnvironmentStore.js";

export type LoginPhase =
	| "checking"
	| "confirm_reauth"
	| "opening_browser"
	| "waiting_auth"
	| "creating_keys"
	| "saving_keys"
	| "complete"
	| "error";

export interface OrgInfo {
	name: string;
	slug: string;
}

export interface UseLoginOptions {
	onComplete?: () => void;
}

export interface UseLoginReturn {
	phase: LoginPhase;
	error: string | null;
	orgInfo: OrgInfo | null;
	authUrl: string | null;
	isAlreadyAuthenticated: boolean;
	confirmReauth: () => void;
	cancelReauth: () => void;
	startTime: number;
}

export function useLogin(options?: UseLoginOptions): UseLoginReturn {
	const onComplete = options?.onComplete;

	const [startTime] = useState(Date.now());
	const [phase, setPhase] = useState<LoginPhase>("checking");
	const [error, setError] = useState<string | null>(null);
	const [orgInfo, setOrgInfo] = useState<OrgInfo | null>(null);
	const [authUrl, _setAuthUrl] = useState<string | null>(null);
	const [isAlreadyAuthenticated, setIsAlreadyAuthenticated] = useState(false);

	const checkStarted = useRef(false);
	const oauthStarted = useRef(false);

	const checkAuthMutation = useMutation({
		mutationFn: async () => {
			const existingKey = readFromEnv({ bypass: true });
			return !!existingKey;
		},
		onSuccess: (hasExistingKey) => {
			setIsAlreadyAuthenticated(hasExistingKey);
			if (hasExistingKey) {
				setPhase("confirm_reauth");
			} else {
				setPhase("opening_browser");
			}
		},
		onError: () => {
			setPhase("opening_browser");
		},
	});

	const oauthMutation = useMutation({
		mutationFn: async () => {
			setPhase("waiting_auth");
			const { tokens } = await startOAuthFlow(CLI_CLIENT_ID);
			return tokens;
		},
		onSuccess: (tokens) => {
			keysMutation.mutate(tokens.access_token);
		},
		onError: (err) => {
			setError(err instanceof Error ? err.message : "Authentication failed");
			setPhase("error");
		},
	});

	const keysMutation = useMutation({
		mutationFn: async (accessToken: string) => {
			setPhase("creating_keys");
			return await getApiKeysWithToken(accessToken);
		},
		onSuccess: (data) => {
			saveMutation.mutate(data);
		},
		onError: (err) => {
			setError(
				err instanceof Error ? err.message : "Failed to create API keys",
			);
			setPhase("error");
		},
	});

	const saveMutation = useMutation({
		mutationFn: async (data: {
			sandboxKey: string;
			prodKey: string;
			orgId: string;
		}) => {
			setPhase("saving_keys");
			await storeEnvKeys(
				{ prodKey: data.prodKey, sandboxKey: data.sandboxKey },
				{ forceOverwrite: true },
			);
			const org = await fetchOrganizationMe({ secretKey: data.sandboxKey });
			return org;
		},
		onSuccess: (org) => {
			setOrgInfo({
				name: org.name,
				slug: org.slug,
			});
			setPhase("complete");
			if (onComplete) {
				setTimeout(onComplete, 1500);
			}
		},
		onError: (err) => {
			setError(err instanceof Error ? err.message : "Failed to save keys");
			setPhase("error");
		},
	});

	const confirmReauth = useCallback(() => {
		oauthStarted.current = false;
		setPhase("opening_browser");
	}, []);

	const cancelReauth = useCallback(() => {
		setPhase("complete");
		if (onComplete) {
			setTimeout(onComplete, 500);
		}
	}, [onComplete]);

	useEffect(() => {
		if (phase === "checking" && !checkStarted.current) {
			checkStarted.current = true;
			checkAuthMutation.mutate();
		}
	}, [phase, checkAuthMutation]);

	useEffect(() => {
		if (phase === "opening_browser" && !oauthStarted.current) {
			oauthStarted.current = true;
			oauthMutation.mutate();
		}
	}, [phase, oauthMutation]);

	return {
		phase,
		error,
		orgInfo,
		authUrl,
		isAlreadyAuthenticated,
		confirmReauth,
		cancelReauth,
		startTime,
	};
}
