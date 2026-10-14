import { useCallback, useRef, useState } from "react";
import { CLI_CLIENT_ID } from "../../commands/auth/constants.js";
import {
	getApiKeysWithToken,
	startOAuthFlow,
} from "../../commands/auth/oauth.js";
import type { ApiError } from "../api/client.js";
import { storeEnvKeys } from "./useEnvironmentStore.js";

export type AuthRecoveryPhase =
	| "idle"
	| "detected"
	| "opening_browser"
	| "waiting_auth"
	| "creating_keys"
	| "saving_keys"
	| "complete"
	| "error";

export interface UseAuthRecoveryOptions {
	onRecovered?: () => void;
	onFailed?: (error: Error) => void;
}

export interface UseAuthRecoveryReturn {
	phase: AuthRecoveryPhase;
	error: string | null;
	isRecovering: boolean;
	isAuthError: (error: unknown) => boolean;
	startRecovery: () => Promise<void>;
	reset: () => void;
}

export function isAuthError(error: unknown): boolean {
	if (!error || typeof error !== "object") return false;
	const apiError = error as ApiError;
	return apiError.status === 401;
}

export function useAuthRecovery(
	options?: UseAuthRecoveryOptions,
): UseAuthRecoveryReturn {
	const { onRecovered, onFailed } = options ?? {};

	const [phase, setPhase] = useState<AuthRecoveryPhase>("idle");
	const [error, setError] = useState<string | null>(null);
	const recoveryInProgress = useRef(false);

	const reset = useCallback(() => {
		setPhase("idle");
		setError(null);
		recoveryInProgress.current = false;
	}, []);

	const startRecovery = useCallback(async () => {
		if (recoveryInProgress.current) return;
		recoveryInProgress.current = true;

		try {
			setPhase("detected");
			setError(null);

			setPhase("opening_browser");
			const { tokens } = await startOAuthFlow(CLI_CLIENT_ID);

			setPhase("creating_keys");
			const { sandboxKey, prodKey } = await getApiKeysWithToken(
				tokens.access_token,
			);

			setPhase("saving_keys");
			await storeEnvKeys({ prodKey, sandboxKey }, { forceOverwrite: true });

			setPhase("complete");
			recoveryInProgress.current = false;

			if (onRecovered) {
				setTimeout(onRecovered, 500);
			}
		} catch (err) {
			const errorMessage =
				err instanceof Error ? err.message : "Authentication failed";
			setError(errorMessage);
			setPhase("error");
			recoveryInProgress.current = false;

			if (onFailed) {
				onFailed(err instanceof Error ? err : new Error(errorMessage));
			}
		}
	}, [onRecovered, onFailed]);

	return {
		phase,
		error,
		isRecovering: phase !== "idle" && phase !== "complete" && phase !== "error",
		isAuthError,
		startRecovery,
		reset,
	};
}
