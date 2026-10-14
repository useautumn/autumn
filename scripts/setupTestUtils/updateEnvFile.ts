import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import chalk from "chalk";
import { config } from "dotenv";
import { TEST_ORG_PUBLISHABLE_KEY } from "./createTestOrg.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function findEnvPath(): string {
	const fromScriptDir = resolve(__dirname, "../../server/.env");
	if (existsSync(fromScriptDir)) {
		return fromScriptDir;
	}

	const fromCwd = resolve(process.cwd(), "server/.env");
	if (existsSync(fromCwd)) {
		return fromCwd;
	}

	return fromScriptDir;
}

export const envPath = findEnvPath();

config({ path: envPath });

export function updateEnvFile({
	testOrgSlug,
	testOrgId,
	autumnSecretKey,
	stripeTestKey,
	upstashUrl,
	upstashToken,
	tunnelUrl,
}: {
	testOrgSlug: string;
	testOrgId: string;
	autumnSecretKey: string | null;
	stripeTestKey: string;
	upstashUrl: string;
	upstashToken: string;
	tunnelUrl: string;
}) {
	console.log(
		chalk.magentaBright(
			"\n================ Updating Environment Variables ================\n",
		),
	);

	let envContent = "";
	try {
		envContent = readFileSync(envPath, "utf-8");
	} catch {
		console.log(
			chalk.red(
				`❌ Could not read server/.env file at ${envPath}. Make sure it exists.`,
			),
		);
		process.exit(1);
	}

	const envVars = new Map<string, string>();
	const lines = envContent.split("\n");

	for (const line of lines) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith("#")) {
			continue;
		}

		const eqIndex = trimmed.indexOf("=");
		if (eqIndex > 0) {
			const key = trimmed.substring(0, eqIndex);
			const value = trimmed.substring(eqIndex + 1);
			envVars.set(key, value);
		}
	}

	envVars.set("TESTS_ORG", testOrgSlug);
	envVars.set("TESTS_ORG_ID", testOrgId);
	envVars.set("UNIT_TEST_AUTUMN_PUBLIC_KEY", TEST_ORG_PUBLISHABLE_KEY);

	if (autumnSecretKey) {
		envVars.set("UNIT_TEST_AUTUMN_SECRET_KEY", autumnSecretKey);
	}

	envVars.set("STRIPE_TEST_KEY", stripeTestKey);
	envVars.set("UPSTASH_REDIS_REST_URL", upstashUrl);
	envVars.set("UPSTASH_REDIS_REST_TOKEN", upstashToken);
	envVars.set("AUTUMN_PUBLIC_API_URL", tunnelUrl);

	const sections: string[][] = [];
	let currentSection: string[] = [];
	let inTestSection = false;

	for (const line of lines) {
		const trimmed = line.trim();

		if (trimmed.startsWith("#")) {
			if (currentSection.length > 0) {
				sections.push(currentSection);
				currentSection = [];
			}
			currentSection.push(line);
			inTestSection = trimmed.toLowerCase().includes("test");
			continue;
		}

		if (
			trimmed.startsWith("TESTS_ORG") ||
			trimmed.startsWith("UNIT_TEST_AUTUMN_PUBLIC_KEY") ||
			trimmed.startsWith("UNIT_TEST_AUTUMN_SECRET_KEY") ||
			trimmed.startsWith("STRIPE_TEST_KEY") ||
			trimmed.startsWith("UPSTASH_REDIS_REST") ||
			(trimmed.startsWith("AUTUMN_PUBLIC_API_URL") && inTestSection)
		) {
			continue;
		}

		currentSection.push(line);
	}

	if (currentSection.length > 0) {
		sections.push(currentSection);
	}

	const testSection = [
		"",
		"# Test Configuration",
		`TESTS_ORG=${testOrgSlug}`,
		`TESTS_ORG_ID=${testOrgId}`,
		`UNIT_TEST_AUTUMN_PUBLIC_KEY=${TEST_ORG_PUBLISHABLE_KEY}`,
	];

	if (autumnSecretKey) {
		testSection.push(`UNIT_TEST_AUTUMN_SECRET_KEY=${autumnSecretKey}`);
	} else if (envVars.has("UNIT_TEST_AUTUMN_SECRET_KEY")) {
		testSection.push(
			`UNIT_TEST_AUTUMN_SECRET_KEY=${envVars.get("UNIT_TEST_AUTUMN_SECRET_KEY")}`,
		);
	}

	testSection.push(
		`STRIPE_TEST_KEY=${stripeTestKey}`,
		"",
		"# Upstash (for caching)",
		`UPSTASH_REDIS_REST_URL=${upstashUrl}`,
		`UPSTASH_REDIS_REST_TOKEN=${upstashToken}`,
		"",
		"# Tunnel URL (for Stripe webhooks)",
		`AUTUMN_PUBLIC_API_URL=${tunnelUrl}`,
		"",
	);

	sections.push(testSection);

	const newContent = sections.map((s) => s.join("\n")).join("\n");
	writeFileSync(envPath, newContent);

	console.log(
		chalk.greenBright(`✅ Environment variables updated in ${envPath}`),
	);
}
