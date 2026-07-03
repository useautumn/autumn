/**
 * Get the appropriate favicon path based on the environment
 * - dev: Orange favicon for local development
 * - staging: Light purple favicon for preview/staging deployments  
 * - prod: Uses existing favicon.ico (no changes to production)
 */
export function getFaviconPath(): string {
	// Check if we're in development
	if (process.env.NODE_ENV === "development") {
		return "/favicon-dev.svg";
	}

	// Check Vercel environment
	const vercelEnv = process.env.VERCEL_ENV || process.env.NEXT_PUBLIC_VERCEL_ENV;
	
	if (vercelEnv === "preview") {
		return "/favicon-staging.svg";
	}

	// Default to existing production favicon (unchanged)
	return "/favicon.ico";
}

/**
 * Get environment-specific favicon config for Next.js metadata
 */
export function getFaviconConfig() {
	const faviconPath = getFaviconPath();
	
	return [
		{ url: faviconPath, sizes: "48x48", type: "image/svg+xml" },
		{ url: "/favicon.ico", sizes: "48x48", type: "image/x-icon" },
		{ url: "/favicon-48x48.png", sizes: "48x48", type: "image/png" },
		{ url: "/icon-192.png", sizes: "192x192", type: "image/png" },
	];
}
