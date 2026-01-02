#!/usr/bin/env node
import chalk from "chalk";
import inquirer from "inquirer";
import {
	createTestOrg,
	TEST_ORG_CONFIG,
} from "../setupTestUtils/createTestOrg.js";

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
		chalk.yellowBright(
			"Before you begin, ensure the following are configured in your environment:\n",
		),
	);

	console.log(chalk.whiteBright("1. Stripe Sandbox Environment Variables"));
	console.log(chalk.gray("   Required in your .env file:"));
	console.log(chalk.gray("   → STRIPE_SANDBOX_CLIENT_ID"));
	console.log(chalk.gray("   → STRIPE_SANDBOX_SECRET_KEY"));
	console.log(chalk.gray("   → STRIPE_SANDBOX_WEBHOOK_SECRET\n"));

	console.log(chalk.whiteBright("2. Stripe Webhook URL"));
	console.log(
		chalk.gray(
			"   → A tunnel URL (e.g., ngrok) pointing to localhost:8080 for webhooks\n",
		),
	);

	console.log(chalk.whiteBright("3. Cache URL"));
	console.log(chalk.gray("   → Redis on your machine\n"));

	// Prompt user to continue
	const { ready } = await inquirer.prompt([
		{
			type: "confirm",
			name: "ready",
			message: chalk.cyan(
				"Have you configured all the above? Ready to create test org?",
			),
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

		// Create test organization in database and get API key
		const autumnSecretKey = await createTestOrg({ db });

		console.log(
			chalk.magentaBright(
				"\n================ Setup Complete! ================\n",
			),
		);
		console.log(chalk.greenBright("🎉 Test organization setup complete! 🎉\n"));
		console.log(chalk.cyan("Test Organization Details:"));
		console.log(chalk.whiteBright(`  Organization: ${TEST_ORG_CONFIG.slug}`));
		console.log(chalk.whiteBright(`  ID: ${TEST_ORG_CONFIG.id}`));
		console.log(chalk.whiteBright(`  Secret Key: ${autumnSecretKey}\n`));

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
