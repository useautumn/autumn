import chalk from "chalk";
import { CLI_CLIENT_ID } from "../../commands/auth/constants.js";
import {
	getApiKeysWithToken,
	startOAuthFlow,
} from "../../commands/auth/oauth.js";
import { isAuthError } from "../hooks/useAuthRecovery.js";
import { storeEnvKeys } from "../hooks/useEnvironmentStore.js";

export async function handleHeadlessAuthError(
	error: unknown,
): Promise<boolean> {
	if (!isAuthError(error)) {
		return false;
	}
	if (process.env.ATMN_DISABLE_AUTH_RECOVERY === "1") {
		return false;
	}

	console.log(chalk.yellow("\n🔐 Session expired. Re-authenticating...\n"));
	console.log(
		chalk.gray("Complete sign-in in your browser, then select an org."),
	);

	try {
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
				continue;
			}
			throw error;
		}
	}
}
