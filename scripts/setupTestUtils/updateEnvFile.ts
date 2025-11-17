import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import chalk from "chalk";
import { config } from "dotenv";

// Get the directory of this script file
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Find server/.env file robustly - works whether running from root or scripts dir
 */
function findEnvPath(): string {
	// Try from setupTestUtils directory (scripts/setupTestUtils/updateEnvFile.ts -> ../../server/.env)
	const fromScriptDir = resolve(__dirname, "../../server/.env");
	if (existsSync(fromScriptDir)) {
		return fromScriptDir;
	}

	// Try from current working directory
	const fromCwd = resolve(process.cwd(), "server/.env");
	if (existsSync(fromCwd)) {
		return fromCwd;
	}

	// If neither exists, return the path from script dir (will fail later with clear error)
	return fromScriptDir;
}

export const envPath = findEnvPath();

// Load existing env vars
config({ path: envPath });

/**
 * Updates server/.env with new test configuration
 */
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

	// Read existing .env file
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

	// Parse existing env vars
	const envVars = new Map<string, string>();
	const lines = envContent.split("\n");

	for (const line of lines) {
		const trimmed = line.trim();
		// Skip empty lines and comments
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

	// Update with new test variables
	envVars.set("TESTS_ORG", testOrgSlug);
	envVars.set("TESTS_ORG_ID", testOrgId);

	// Only update the secret key if a new one was generated
	if (autumnSecretKey) {
		envVars.set("UNIT_TEST_AUTUMN_SECRET_KEY", autumnSecretKey);
	}

	envVars.set("STRIPE_TEST_KEY", stripeTestKey);
	envVars.set("UPSTASH_REDIS_REST_URL", upstashUrl);
	envVars.set("UPSTASH_REDIS_REST_TOKEN", upstashToken);
	envVars.set("STRIPE_WEBHOOK_URL", tunnelUrl);

	// Build new env content, preserving structure
	const sections: string[][] = [];
	let currentSection: string[] = [];
	let inTestSection = false;

	for (const line of lines) {
		const trimmed = line.trim();

		// Check if this is a section header
		if (trimmed.startsWith("#")) {
			if (currentSection.length > 0) {
				sections.push(currentSection);
				currentSection = [];
			}
			currentSection.push(line);
			inTestSection = trimmed.toLowerCase().includes("test");
			continue;
		}

		// Skip test-related vars from existing content - we'll add them fresh
		if (
			trimmed.startsWith("TESTS_ORG") ||
			trimmed.startsWith("UNIT_TEST_AUTUMN_SECRET_KEY") ||
			trimmed.startsWith("STRIPE_TEST_KEY") ||
			trimmed.startsWith("UPSTASH_REDIS_REST") ||
			(trimmed.startsWith("STRIPE_WEBHOOK_URL") && inTestSection)
		) {
			continue;
		}

		currentSection.push(line);
	}

	if (currentSection.length > 0) {
		sections.push(currentSection);
	}

	// Add test configuration section
	const testSection = [
		"",
		"# Test Configuration",
		`TESTS_ORG=${testOrgSlug}`,
		`TESTS_ORG_ID=${testOrgId}`,
	];

	// Only add secret key if it was generated/updated
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
		`STRIPE_WEBHOOK_URL=${tunnelUrl}`,
		"",
	);

	sections.push(testSection);

	// Write back to file
	const newContent = sections.map((s) => s.join("\n")).join("\n");
	writeFileSync(envPath, newContent);

	console.log(
		chalk.greenBright(`✅ Environment variables updated in ${envPath}`),
	);
}
