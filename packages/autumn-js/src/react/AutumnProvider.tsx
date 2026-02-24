"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type ReactNode, useMemo, useRef } from "react";
import { AutumnContext, type AutumnContextValue } from "./AutumnContext";
import { createAutumnClient } from "./client/AutumnClient";

const DEFAULT_PATH_PREFIX = "/api/autumn";
const BETTER_AUTH_PATH_PREFIX = "/api/auth/autumn";

export type AutumnProviderProps = {
	children: ReactNode;
	backendUrl?: string;
	pathPrefix?: string;
	useBetterAuth?: boolean;
	includeCredentials?: boolean;
};

/**
 * Provider component for Autumn billing SDK.
 *
 * @param backendUrl - Base URL for the backend server (e.g., "https://api.example.com"). Defaults to current origin.
 * @param pathPrefix - Path prefix for the Autumn routes. Defaults to "/api/autumn", or "/api/auth/autumn" if useBetterAuth is true.
 * @param useBetterAuth - Use better-auth integration. Sets pathPrefix to "/api/auth/autumn" and includeCredentials to true by default.
 * @param includeCredentials - Include credentials (cookies) in cross-origin requests. Defaults to true if useBetterAuth is true.
 */
export const AutumnProvider = ({
	children,
	backendUrl,
	pathPrefix,
	useBetterAuth,
	includeCredentials,
}: AutumnProviderProps) => {
	const queryClientRef = useRef<QueryClient | null>(null);
	if (!queryClientRef.current) {
		queryClientRef.current = new QueryClient({
			defaultOptions: {
				queries: {
					staleTime: 1000 * 60,
					retry: false,
					refetchOnWindowFocus: false,
					refetchOnReconnect: false,
				},
			},
		});
	}

	const contextValue = useMemo<AutumnContextValue>(() => {
		const resolvedPathPrefix =
			pathPrefix ??
			(useBetterAuth ? BETTER_AUTH_PATH_PREFIX : DEFAULT_PATH_PREFIX);

		const resolvedIncludeCredentials = includeCredentials ?? useBetterAuth;

		const client = createAutumnClient({
			backendUrl,
			pathPrefix: resolvedPathPrefix,
			includeCredentials: resolvedIncludeCredentials,
		});
		return { client };
	}, [backendUrl, pathPrefix, useBetterAuth, includeCredentials]);

	return (
		<QueryClientProvider client={queryClientRef.current}>
			<AutumnContext.Provider value={contextValue}>
				{children}
			</AutumnContext.Provider>
		</QueryClientProvider>
	);
};
