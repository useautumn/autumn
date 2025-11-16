#!/usr/bin/env node
import chalk from "chalk";
import inquirer from "inquirer";
import {
	createTestOrg,
	TEST_ORG_CONFIG,
} from "../setupTestUtils/createTestOrg.js";
import {
	updateMultipleEnvVars,
	updateSingleEnvVar,
} from "../setupTestUtils/incrementalEnvUpdate.js";
import {
	setupStripeTestKey,
	setupTunnelUrl,
	setupUpstash,
} from "../setupTestUtils/setupPrompts.js";
import { updateEnvFile } from "../setupTestUtils/updateEnvFile.js";

async function showPreparationChecklist() {
	console.log(
		chalk.magentaBright(
			"\n================ Autumn Test Setup ================\n",
		),
	);
	console.log(
		chalk.cyan(
			"This script will set up a test organization for development.\n",
		),
	);
	console.log(
		chalk.yellowBright("Before you begin, please have the following ready:\n"),
	);

	console.log(chalk.whiteBright("1. Stripe Test API Key (sk_test_...)"));
	console.log(
		chalk.gray(
			"   → Used to link Stripe to your test account for payment processing\n",
		),
	);

	console.log(chalk.whiteBright("2. Upstash Redis REST URL and Token"));
	console.log(
		chalk.gray(
			"   → Used for caching customer objects and testing race conditions\n",
		),
	);

	console.log(chalk.whiteBright("3. Tunnel URL (e.g., ngrok URL)"));
	console.log(
		chalk.gray(
			"   → Points to localhost:8080 so Stripe webhooks can reach your server\n",
		),
	);

	// Prompt user to continue
	const { ready } = await inquirer.prompt([
		{
			type: "confirm",
			name: "ready",
			message: chalk.cyan("Ready to begin setup?"),
			default: true,
		},
	]);

	if (!ready) {
		console.log(
			chalk.yellow(
				"\nSetup cancelled. Run the script again when you're ready!\n",
			),
		);
		process.exit(0);
	}
}

async function main() {
	// Show preparation checklist
	await showPreparationChecklist();

	try {
		// Import db from server
		const { db } = await import("@server/db/initDrizzle.js");

		// Step 1: Create test organization in database and get API key
		const autumnSecretKey = await createTestOrg({ db });

		// Save org details immediately
		updateMultipleEnvVars({
			TESTS_ORG: TEST_ORG_CONFIG.slug,
			TESTS_ORG_ID: TEST_ORG_CONFIG.id,
			...(autumnSecretKey && { UNIT_TEST_AUTUMN_SECRET_KEY: autumnSecretKey }),
		});

		// Step 2: Get Stripe test key
		const stripeTestKey = await setupStripeTestKey();

		// Save Stripe key immediately
		updateSingleEnvVar({ key: "STRIPE_TEST_KEY", value: stripeTestKey });

		// Step 3: Get Upstash configuration
		const { upstashUrl, upstashToken } = await setupUpstash();

		// Save Upstash credentials immediately
		updateMultipleEnvVars({
			UPSTASH_REDIS_REST_URL: upstashUrl,
			UPSTASH_REDIS_REST_TOKEN: upstashToken,
		});

		// Step 4: Get tunnel URL
		const tunnelUrl = await setupTunnelUrl();

		// Save tunnel URL immediately
		updateSingleEnvVar({ key: "STRIPE_WEBHOOK_URL", value: tunnelUrl });

		// Step 5: Final update to ensure proper formatting
		updateEnvFile({
			testOrgSlug: TEST_ORG_CONFIG.slug,
			testOrgId: TEST_ORG_CONFIG.id,
			autumnSecretKey,
			stripeTestKey,
			upstashUrl,
			upstashToken,
			tunnelUrl,
		});

		console.log(
			chalk.magentaBright(
				"\n================ Setup Complete! ================\n",
			),
		);
		console.log(chalk.greenBright("🎉 Test organization setup complete! 🎉\n"));
		console.log(chalk.cyan("Test Organization Details:"));
		console.log(chalk.whiteBright(`  Organization: ${TEST_ORG_CONFIG.slug}`));
		console.log(chalk.whiteBright(`  ID: ${TEST_ORG_CONFIG.id}`));

		if (autumnSecretKey) {
			console.log(chalk.whiteBright(`  Secret Key: ${autumnSecretKey}\n`));
		} else {
			console.log(
				chalk.whiteBright("  Secret Key: (using existing key from .env)\n"),
			);
		}

		console.log(chalk.cyan("Next steps:"));
		console.log(
			chalk.whiteBright("1. Start your tunnel (e.g., ngrok http 8080)"),
		);
		console.log(chalk.whiteBright("2. Start your development server"));
		console.log(
			chalk.whiteBright("3. Run tests with your new test organization!\n"),
		);

		process.exit(0);
	} catch (error) {
		console.error(
			chalk.red("\n❌ Setup failed:"),
			error instanceof Error ? error.message : error,
		);
		process.exit(1);
	}
}

main();
