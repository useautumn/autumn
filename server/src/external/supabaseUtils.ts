import { createClient } from "@supabase/supabase-js";
import fetchRetry from "fetch-retry";

// Wrap the global fetch with fetch-retry
const fetchWithRetry = fetchRetry(fetch, {
	retries: 3,
	retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 30000), // Exponential backoff starting at 1s, max 30s
	retryOn: (attempt, error, response) => {
		// Retry on gateway errors (502) and Cloudflare errors (520)

		let shouldRetry = false;
		try {
			if (
				error?.message?.includes("cloudflare") ||
				error?.message?.includes("fetch failed")
			) {
				shouldRetry = true;
			}
		} catch (error) {}

		if (
			(response && (response.status === 502 || response.status === 520)) ||
			shouldRetry
		) {
			console.warn(
				`Retrying request... Attempt #${attempt + 1} - Status: ${
					response?.status
				}`,
			);
			return true;
		}

		return false;
	},
});

export const createSupabaseClient = () => {
	try {
		return createClient(
			process.env.SUPABASE_URL!,
			process.env.SUPABASE_SERVICE_KEY!,
		);
	} catch (error) {
		console.error("Error creating Supabase client:", error);
		throw error;
	}
};
