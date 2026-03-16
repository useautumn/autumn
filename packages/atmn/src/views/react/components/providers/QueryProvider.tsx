import {
	MutationCache,
	QueryCache,
	QueryClient,
	QueryClientProvider,
} from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useCallback, useMemo, useState } from "react";
import { isAuthError } from "../../../../lib/hooks/useAuthRecovery.js";
import { AuthRecoveryBoundary } from "../AuthRecoveryBoundary.js";

interface QueryProviderProps {
	children: ReactNode;
}

/**
 * QueryProvider with global 401 error handling
 *
 * When a 401 error is detected from any query or mutation:
 * 1. The error is caught by the global handler
 * 2. Auth recovery UI is shown (OAuth flow)
 * 3. After successful auth, queries are refetched
 */
export function QueryProvider({ children }: QueryProviderProps) {
	const [authError, setAuthError] = useState<unknown>(null);

	// Handle auth errors globally
	const handleError = useCallback((error: unknown) => {
		if (isAuthError(error)) {
			setAuthError(error);
		}
	}, []);

	// Create query client with error handlers
	const queryClient = useMemo(() => {
		return new QueryClient({
			queryCache: new QueryCache({
				onError: handleError,
			}),
			mutationCache: new MutationCache({
				onError: handleError,
			}),
			defaultOptions: {
				queries: {
					retry: false,
					refetchOnWindowFocus: false,
				},
			},
		});
	}, [handleError]);

	// Handle successful auth recovery - refetch all queries
	const handleRetry = useCallback(() => {
		setAuthError(null);
		queryClient.invalidateQueries();
	}, [queryClient]);

	// If we have an auth error, show recovery boundary
	if (authError) {
		return (
			<QueryClientProvider client={queryClient}>
				<AuthRecoveryBoundary onRetry={handleRetry}>
					{null}
				</AuthRecoveryBoundary>
			</QueryClientProvider>
		);
	}

	return (
		<QueryClientProvider client={queryClient}>
			{children as unknown as never}
		</QueryClientProvider>
	);
}
