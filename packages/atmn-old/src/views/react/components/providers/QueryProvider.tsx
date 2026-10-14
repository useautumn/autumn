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

export function QueryProvider({ children }: QueryProviderProps) {
	const [authError, setAuthError] = useState<unknown>(null);

	const handleError = useCallback((error: unknown) => {
		if (isAuthError(error)) {
			setAuthError(error);
		}
	}, []);

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

	const handleRetry = useCallback(() => {
		setAuthError(null);
		queryClient.invalidateQueries();
	}, [queryClient]);

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
