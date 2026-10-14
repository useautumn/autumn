#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import chalk from "chalk";
import inquirer from "inquirer";
import { PROJECT_ROOT } from "../dw/constants.js";
import { mergeEnvFile } from "../dw/helpers/env-files.js";
import {
	createTestOrg,
	ensureTestOrgOwner,
	ensureTestOrgStripeAccount,
	TEST_ORG_CONFIG,
	TEST_ORG_PUBLISHABLE_KEY,
} from "../setupTestUtils/createTestOrg.js";
import { ensureTestOrgSecretKey } from "../setupTestUtils/ensureTestOrgSecretKey.js";

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

function persistTestKeysToEnvLocal({
	secretKey,
	allowCreate,
}: {
	secretKey: string;
	allowCreate: boolean;
}): void {
	process.env.UNIT_TEST_AUTUMN_SECRET_KEY = secretKey;
	process.env.UNIT_TEST_AUTUMN_PUBLIC_KEY = TEST_ORG_PUBLISHABLE_KEY;

	const envPath = join(PROJECT_ROOT, "server", ".env.local");
	const exists = existsSync(envPath);
	if (!exists && !allowCreate) {
		console.log(
			chalk.cyan(
				`[setup-test] skipped .env.local write (file absent; using env/Infisical)`,
			),
		);
		return;
	}

	const existing = exists ? readFileSync(envPath, "utf-8") : null;
	const merged = mergeEnvFile(existing, {
		UNIT_TEST_AUTUMN_SECRET_KEY: secretKey,
		UNIT_TEST_AUTUMN_PUBLIC_KEY: TEST_ORG_PUBLISHABLE_KEY,
	});
	writeFileSync(envPath, merged);
	console.log(
		chalk.cyan(
			`[setup-test] persisted UNIT_TEST_AUTUMN_SECRET_KEY + UNIT_TEST_AUTUMN_PUBLIC_KEY to server/.env.local`,
		),
	);
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

async function runEnsureKey(): Promise<void> {
	console.log(
		chalk.magentaBright(
			`\n================ Autumn ensure-test-org-key ================\n`,
		),
	);
	console.log(
		chalk.cyan(`Target: ${maskDatabaseUrl(process.env.DATABASE_URL)}\n`),
	);

	const { db } = await import("@server/db/initDrizzle.js");
	const { key, generated } = await ensureTestOrgSecretKey({ db });
	persistTestKeysToEnvLocal({ secretKey: key, allowCreate: generated });

	console.log(chalk.greenBright("\n✅ ensure-test-org-key complete\n"));
}

async function runFullSetup({ yes }: { yes: boolean }): Promise<void> {
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

	const hadKey = Boolean(process.env.UNIT_TEST_AUTUMN_SECRET_KEY?.trim());
	const { db } = await import("@server/db/initDrizzle.js");
	const autumnSecretKey = await createTestOrg({ db });
	persistTestKeysToEnvLocal({
		secretKey: autumnSecretKey,
		allowCreate: !hadKey,
	});

	console.log(chalk.greenBright("\n✅ setup-test complete"));
	console.log(chalk.cyan("Org:"));
	console.log(chalk.whiteBright(`  slug: ${TEST_ORG_CONFIG.slug}`));
	console.log(chalk.whiteBright(`  id:   ${TEST_ORG_CONFIG.id}\n`));
}

async function runEnsure(): Promise<void> {
	const { db } = await import("@server/db/initDrizzle.js");
	const { organizations } = await import("@autumn/shared");
	const { eq } = await import("drizzle-orm");
	const existing = await db.query.organizations.findFirst({
		where: eq(organizations.id, TEST_ORG_CONFIG.id),
	});
	if (!existing) {
		await runFullSetup({ yes: true });
		return;
	}
	await ensureTestOrgStripeAccount({ org: existing });
	await ensureTestOrgOwner({ db });
	await runEnsureKey();
}

async function main() {
	const yes = process.argv.includes("--yes");
	const ensureKeyOnly = process.argv.includes("--ensure-key");
	const ensure = process.argv.includes("--ensure");

	try {
		if (ensure) {
			await runEnsure();
		} else if (ensureKeyOnly) {
			await runEnsureKey();
		} else {
			await runFullSetup({ yes });
		}
		process.exit(0);
	} catch (error) {
		console.error(
			chalk.red(
				ensureKeyOnly
					? "\n❌ ensure-test-org-key failed:"
					: "\n❌ setup-test failed:",
			),
			error instanceof Error ? error.message : error,
		);
		process.exit(1);
	}
}

main();
