import chalk from "chalk";
import { CLI_CLIENT_ID } from "../../commands/auth/constants.js";
import {
	getApiKeysWithToken,
	startOAuthFlow,
} from "../../commands/auth/oauth.js";
import { isAuthError } from "../hooks/useAuthRecovery.js";
import { storeEnvKeys } from "../hooks/useEnvironmentStore.js";

/**
 * Handle 401 errors in headless mode by running OAuth flow
 *
 * @param error The error to check
 * @returns true if auth was recovered, false if error was not a 401
 * @throws if auth recovery fails
 */
export async function handleHeadlessAuthError(
	error: unknown,
): Promise<boolean> {
	if (!isAuthError(error)) {
		return false;
	}

	console.log(chalk.yellow("\n🔐 Session expired. Re-authenticating...\n"));
	console.log(
		chalk.gray("Complete sign-in in your browser, then select an org."),
	);

	try {
		// Start OAuth flow - will open browser
		const { tokens } = await startOAuthFlow(CLI_CLIENT_ID, { headless: true });

		console.log(chalk.dim("Creating API keys..."));
		const { sandboxKey, prodKey } = await getApiKeysWithToken(
			tokens.access_token,
		);

		console.log(chalk.dim("Saving keys to .env..."));
		await storeEnvKeys({ prodKey, sandboxKey }, { forceOverwrite: true });

		console.log(chalk.green("✓ Re-authenticated successfully!\n"));
		console.log(chalk.gray("Resuming your previous command...\n"));

		return true;
	} catch (authError) {
		console.error(chalk.red("\n✗ Authentication failed."));
		console.error(
			chalk.red(
				`  ${authError instanceof Error ? authError.message : String(authError)}`,
			),
		);
		console.error(chalk.gray("\nPlease try again with `atmn login`.\n"));
		throw authError;
	}
}

/**
 * Wrap an async function to automatically handle 401 errors with auth recovery
 *
 * @param fn The async function to wrap
 * @param maxRetries Maximum number of auth recovery attempts (default: 1)
 * @returns The wrapped function that handles 401s automatically
 *
 * Usage:
 * ```typescript
 * const result = await withAuthRecovery(async () => {
 *   return await someApiCall();
 * });
 * ```
 */
export async function withAuthRecovery<T>(
	fn: () => Promise<T>,
	maxRetries = 1,
): Promise<T> {
	let attempts = 0;

	while (true) {
		try {
			return await fn();
		} catch (error) {
			if (attempts < maxRetries && (await handleHeadlessAuthError(error))) {
				attempts++;
				// Auth recovered, retry the operation
				continue;
			}
			// Not a 401, or max retries exceeded, or auth recovery failed
			throw error;
		}
	}
}
