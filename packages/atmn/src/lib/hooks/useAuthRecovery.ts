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
	/** Called when auth recovery completes successfully */
	onRecovered?: () => void;
	/** Called when auth recovery fails */
	onFailed?: (error: Error) => void;
}

export interface UseAuthRecoveryReturn {
	/** Current phase of the recovery flow */
	phase: AuthRecoveryPhase;
	/** Error message if recovery failed */
	error: string | null;
	/** Whether auth recovery is in progress */
	isRecovering: boolean;
	/** Check if an error is a 401 that should trigger recovery */
	isAuthError: (error: unknown) => boolean;
	/** Start the recovery flow */
	startRecovery: () => Promise<void>;
	/** Reset the recovery state */
	reset: () => void;
}

/**
 * Check if an error is a 401 authentication error
 */
export function isAuthError(error: unknown): boolean {
	if (!error || typeof error !== "object") return false;
	const apiError = error as ApiError;
	return apiError.status === 401;
}

/**
 * Hook to handle 401 authentication errors by running OAuth flow
 *
 * Usage:
 * ```tsx
 * const authRecovery = useAuthRecovery({ onRecovered: refetch });
 *
 * // In error handler:
 * if (authRecovery.isAuthError(error)) {
 *   await authRecovery.startRecovery();
 * }
 * ```
 */
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
		// Prevent multiple simultaneous recovery attempts
		if (recoveryInProgress.current) return;
		recoveryInProgress.current = true;

		try {
			setPhase("detected");
			setError(null);

			// Start OAuth flow
			setPhase("opening_browser");
			const { tokens } = await startOAuthFlow(CLI_CLIENT_ID);

			// Create API keys
			setPhase("creating_keys");
			const { sandboxKey, prodKey } = await getApiKeysWithToken(
				tokens.access_token,
			);

			// Save keys
			setPhase("saving_keys");
			await storeEnvKeys({ prodKey, sandboxKey }, { forceOverwrite: true });

			setPhase("complete");
			recoveryInProgress.current = false;

			// Notify success
			if (onRecovered) {
				// Small delay to let UI update
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
