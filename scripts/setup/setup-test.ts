#!/usr/bin/env node
import chalk from "chalk";
import inquirer from "inquirer";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
	createTestOrg,
	TEST_ORG_CONFIG,
	TEST_ORG_PUBLISHABLE_KEY,
} from "../setupTestUtils/createTestOrg.js";
import { mergeEnvFile } from "../dw/helpers/env-files.js";
import { PROJECT_ROOT } from "../dw/constants.js";

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
		const hadKey = Boolean(process.env.UNIT_TEST_AUTUMN_SECRET_KEY);
		const { db } = await import("@server/db/initDrizzle.js");
		const autumnSecretKey = await createTestOrg({ db });

		if (!hadKey) {
			const envPath = join(PROJECT_ROOT, "server", ".env.local");
			const existing = existsSync(envPath) ? readFileSync(envPath, "utf-8") : null;
			const merged = mergeEnvFile(existing, {
				UNIT_TEST_AUTUMN_SECRET_KEY: autumnSecretKey,
			});
			writeFileSync(envPath, merged);
			process.env.UNIT_TEST_AUTUMN_SECRET_KEY = autumnSecretKey;
			console.log(
				chalk.cyan(`[setup-test] persisted UNIT_TEST_AUTUMN_SECRET_KEY to server/.env.local`),
			);
		}

		const envPath = join(PROJECT_ROOT, "server", ".env.local");
		const existing = existsSync(envPath) ? readFileSync(envPath, "utf-8") : null;
		const merged = mergeEnvFile(existing, {
			UNIT_TEST_AUTUMN_PUBLIC_KEY: TEST_ORG_PUBLISHABLE_KEY,
		});
		writeFileSync(envPath, merged);
		process.env.UNIT_TEST_AUTUMN_PUBLIC_KEY = TEST_ORG_PUBLISHABLE_KEY;
		console.log(
			chalk.cyan(`[setup-test] persisted UNIT_TEST_AUTUMN_PUBLIC_KEY to server/.env.local`),
		);

		const apiUrl = process.env.STRIPE_WEBHOOK_URL || process.env.BETTER_AUTH_URL;
		const isPublic = apiUrl?.startsWith("https://") && !!process.env.DEV_EXTRA_CORS_ORIGINS;
		if (isPublic) {
			try {
				const { registerMasterConnectWebhook } = await import(
					"@server/external/connect/registerMasterConnectWebhook.js"
				);
				const { AppEnv } = await import("@autumn/shared");
				const result = await registerMasterConnectWebhook({
					db,
					orgId: TEST_ORG_CONFIG.id,
					env: AppEnv.Sandbox,
					webhookBaseUrl: apiUrl!,
				});
				console.log(
					chalk.greenBright(
						`✅ Stripe webhook ${result.reused ? "reused" : "registered"}: ${result.webhookId}`,
					),
				);
			} catch (err) {
				console.warn(
					chalk.yellow(
						`[setup-test] webhook registration failed (continuing): ${
							err instanceof Error ? err.message : err
						}`,
					),
				);
			}
		} else {
			console.log(chalk.gray(`[setup-test] no sparq URL set — skipping webhook registration`));
		}

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
