#!/usr/bin/env node
import chalk from "chalk";
import inquirer from "inquirer";
import {
	createTestOrg,
	TEST_ORG_CONFIG,
} from "../setupTestUtils/createTestOrg.js";

// Worktree .env.local loading happens in scripts/preload-env.ts (auto-run by
// Bun via bunfig.toml's `preload`). DATABASE_URL flips to the worktree branch
// before this module's top-level statements execute.

function maskDatabaseUrl(url: string | undefined): string {
	if (!url) return "(unset)";
	try {
		const u = new URL(url);
		const host = u.host;
		const db = u.pathname.replace(/^\//, "");
		return `${u.protocol}//***@${host}/${db}`;
	} catch {
		return "(unparseable)";
	}
}

async function maybeConfirm(yes: boolean): Promise<boolean> {
	if (yes) return true;
	if (!process.stdin.isTTY) return true;
	const target = maskDatabaseUrl(process.env.DATABASE_URL);
	const { ready } = await inquirer.prompt([
		{
			type: "confirm",
			name: "ready",
			message: chalk.cyan(
				`About to seed '${TEST_ORG_CONFIG.slug}' into DATABASE_URL=${target}. Continue?`,
			),
			default: true,
		},
	]);
	return Boolean(ready);
}

async function main() {
	const yes = process.argv.includes("--yes");
	console.log(
		chalk.magentaBright(
			`\n================ Autumn setup-test ================\n`,
		),
	);
	console.log(
		chalk.cyan(`Target: ${maskDatabaseUrl(process.env.DATABASE_URL)}\n`),
	);

	const proceed = await maybeConfirm(yes);
	if (!proceed) {
		console.log(chalk.yellow("Cancelled."));
		process.exit(0);
	}

	try {
		const { db } = await import("@server/db/initDrizzle.js");
		const autumnSecretKey = await createTestOrg({ db });

		console.log(chalk.greenBright("\n✅ setup-test complete"));
		console.log(chalk.cyan("Org:"));
		console.log(chalk.whiteBright(`  slug: ${TEST_ORG_CONFIG.slug}`));
		console.log(chalk.whiteBright(`  id:   ${TEST_ORG_CONFIG.id}`));
		console.log(chalk.whiteBright(`  key:  ${autumnSecretKey}\n`));
		process.exit(0);
	} catch (error) {
		console.error(
			chalk.red("\n❌ setup-test failed:"),
			error instanceof Error ? error.message : error,
		);
		process.exit(1);
	}
}

main();
