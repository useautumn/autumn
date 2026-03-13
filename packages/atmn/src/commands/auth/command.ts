import { confirm } from "@inquirer/prompts";
import chalk from "chalk";
import { initSpinner, readFromEnv, storeToEnv } from "../../lib/utils.js";
import { CLI_CLIENT_ID } from "./constants.js";
import { getApiKeysWithToken, startOAuthFlow } from "./oauth.js";

const inputTheme = {
	style: {
		answer: (text: string) => {
			return chalk.magenta(text);
		},
	},
};

export default async function AuthCommand() {
	if (readFromEnv({ bypass: true })) {
		const shouldReauth = await confirm({
			message:
				"You are already authenticated. Would you like to re-authenticate?",
			theme: inputTheme,
		});
		if (!shouldReauth) return;
	}

	console.log(chalk.cyan("\nOpening browser for authentication..."));
	console.log(
		chalk.gray("Please sign in and select the organization you want to use.\n"),
	);

	const spinner = initSpinner("Waiting for authorization...");

	try {
		// Start OAuth flow - opens browser and waits for callback
		const { tokens } = await startOAuthFlow(CLI_CLIENT_ID);

		spinner.text = "Creating API keys...";

		// Use the access token to create API keys
		const { sandboxKey, prodKey } = await getApiKeysWithToken(
			tokens.access_token,
		);

		spinner.stop();

		// Store keys to .env
		await storeToEnv(prodKey, sandboxKey);

		console.log(
			chalk.green(
				"\nSuccess! Sandbox and production keys have been saved to your .env file.",
			),
		);
		console.log(
			chalk.gray(
				"`atmn` uses the AUTUMN_SECRET_KEY to authenticate with the Autumn API.\n",
			),
		);
		process.exit(0);
	} catch (error) {
		spinner.stop();
		if (error instanceof Error) {
			console.error(chalk.red(`\nAuthentication failed: ${error.message}`));
		} else {
			console.error(chalk.red("\nAuthentication failed. Please try again."));
		}
		process.exit(1);
	}
}
