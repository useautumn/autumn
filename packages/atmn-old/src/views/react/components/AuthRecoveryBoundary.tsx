import { Box, Text } from "ink";
// biome-ignore lint/style/useImportType: needed for ink
import React, {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useState,
} from "react";
import {
	type AuthRecoveryPhase,
	isAuthError,
	useAuthRecovery,
} from "../../../lib/hooks/useAuthRecovery.js";
import { Card } from "./Card.js";
import { LoadingText } from "./LoadingText.js";
import { CardWidthProvider } from "./providers/CardWidthContext.js";

const _AUTH_URL = "https://app.useautumn.com/cli-auth";

interface AuthRecoveryContextValue {
	isAuthError: (error: unknown) => boolean;
	handleError: (error: unknown) => boolean;
	isRecovering: boolean;
	phase: AuthRecoveryPhase;
}

const AuthRecoveryContext = createContext<AuthRecoveryContextValue | null>(
	null,
);

export function useAuthRecoveryContext(): AuthRecoveryContextValue {
	const context = useContext(AuthRecoveryContext);
	if (!context) {
		throw new Error(
			"useAuthRecoveryContext must be used within AuthRecoveryBoundary",
		);
	}
	return context;
}

interface AuthRecoveryBoundaryProps {
	children: React.ReactNode;
	onRetry?: () => void;
}

export function AuthRecoveryBoundary({
	children,
	onRetry,
}: AuthRecoveryBoundaryProps) {
	const [shouldShowRecovery, setShouldShowRecovery] = useState(false);

	const authRecovery = useAuthRecovery({
		onRecovered: () => {
			setShouldShowRecovery(false);
			if (onRetry) {
				onRetry();
			}
		},
		onFailed: () => {
		},
	});

	const handleError = useCallback(
		(error: unknown): boolean => {
			if (isAuthError(error)) {
				setShouldShowRecovery(true);
				authRecovery.startRecovery();
				return true;
			}
			return false;
		},
		[authRecovery],
	);

	useEffect(() => {
		if (shouldShowRecovery && authRecovery.phase === "idle") {
			authRecovery.startRecovery();
		}
	}, [shouldShowRecovery, authRecovery]);

	const contextValue: AuthRecoveryContextValue = {
		isAuthError,
		handleError,
		isRecovering: authRecovery.isRecovering,
		phase: authRecovery.phase,
	};

	if (shouldShowRecovery) {
		return (
			<AuthRecoveryContext.Provider value={contextValue}>
				<AuthRecoveryView
					phase={authRecovery.phase}
					error={authRecovery.error}
				/>
			</AuthRecoveryContext.Provider>
		);
	}

	return (
		<AuthRecoveryContext.Provider value={contextValue}>
			{children}
		</AuthRecoveryContext.Provider>
	);
}

interface AuthRecoveryViewProps {
	phase: AuthRecoveryPhase;
	error: string | null;
}

function AuthRecoveryView({ phase, error }: AuthRecoveryViewProps) {
	return (
		<CardWidthProvider>
			<Box flexDirection="column" marginBottom={1}>
				<Card title="🔐 Session Expired">
					<Text>Your authentication has expired or is invalid.</Text>
					<Text color="gray">Please re-authenticate to continue.</Text>
				</Card>

				{(phase === "detected" ||
					phase === "opening_browser" ||
					phase === "waiting_auth") && (
					<Card title="🌐 Browser">
						<LoadingText
							text={
								phase === "detected"
									? "Preparing authentication..."
									: phase === "opening_browser"
										? "Opening browser..."
										: "Waiting for authentication..."
							}
						/>
					</Card>
				)}

				{phase === "creating_keys" && (
					<Card title="🔑 API Keys">
						<LoadingText text="Creating API keys..." />
					</Card>
				)}

				{phase === "saving_keys" && (
					<Card title="🔑 API Keys">
						<LoadingText text="Saving keys to .env..." />
					</Card>
				)}

				{phase === "complete" && (
					<Card title="✓ Re-authenticated">
						<Text color="green">Authentication successful!</Text>
						<Text color="gray">Resuming your previous command...</Text>
					</Card>
				)}

				{phase === "error" && (
					<Card title="✗ Authentication Failed">
						<Text color="red">{error || "An unknown error occurred."}</Text>
						<Box marginTop={1}>
							<Text color="gray">Please try again with `atmn login`.</Text>
						</Box>
					</Card>
				)}
			</Box>
		</CardWidthProvider>
	);
}

export { isAuthError };
