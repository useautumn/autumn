import { exec, spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import readline from "node:readline";
import { promisify } from "node:util";

const execAsync = promisify(exec);

/**
 * Execute command and show live output
 */
function execWithOutput(command: string): Promise<void> {
	return new Promise((resolve, reject) => {
		const child = spawn(command, {
			shell: true,
			stdio: "inherit",
		});

		child.on("close", (code) => {
			if (code === 0) {
				resolve();
			} else {
				reject(new Error(`Command failed with exit code ${code}`));
			}
		});

		child.on("error", reject);
	});
}

/**
 * Prompt user for confirmation
 */
function promptUser(question: string): Promise<boolean> {
	const rl = readline.createInterface({
		input: process.stdin,
		output: process.stdout,
	});

	return new Promise((resolve) => {
		rl.question(question, (answer) => {
			rl.close();
			resolve(answer.toLowerCase() === "y" || answer.toLowerCase() === "yes");
		});
	});
}

/**
 * Validate PostgreSQL URL format
 */
function validatePostgresUrl(url: string): boolean {
	return url.startsWith("postgresql://") || url.startsWith("postgres://");
}

/**
 * Extract database name from PostgreSQL URL
 */
function extractDbName(url: string): string {
	try {
		const urlObj = new URL(url);
		return urlObj.pathname.slice(1) || "database";
	} catch {
		return "database";
	}
}

/**
 * Build connection URL to default postgres database
 * Used for creating databases and checking if they exist
 */
function buildDefaultDbUrl(url: string): string {
	try {
		const urlObj = new URL(url);
		// Replace the database name with 'postgres' (default database)
		urlObj.pathname = "/postgres";
		return urlObj.toString();
	} catch {
		return url;
	}
}

/**
 * Escape single quotes in database name for SQL queries
 */
function escapeDbName(dbName: string): string {
	return dbName.replace(/'/g, "''");
}

/**
 * Check if a database exists
 */
async function databaseExists(dbUrl: string, dbName: string): Promise<boolean> {
	try {
		const defaultDbUrl = buildDefaultDbUrl(dbUrl);
		const cleanedUrl = cleanUrl(defaultDbUrl);
		const escapedDbName = escapeDbName(dbName);
		const { stdout } = await execAsync(
			`psql "${cleanedUrl}" -t -c "SELECT 1 FROM pg_database WHERE datname = '${escapedDbName}';"`,
		);
		return stdout.trim() === "1";
	} catch {
		return false;
	}
}

/**
 * Create a database if it doesn't exist
 */
async function ensureDatabaseExists(
	dbUrl: string,
	dbName: string,
): Promise<void> {
	const exists = await databaseExists(dbUrl, dbName);
	if (exists) {
		console.log(`✅ Database "${dbName}" already exists`);
		return;
	}

	console.log(`📝 Creating database "${dbName}"...`);
	try {
		const defaultDbUrl = buildDefaultDbUrl(dbUrl);
		const cleanedUrl = cleanUrl(defaultDbUrl);
		await execWithOutput(
			`psql "${cleanedUrl}" -c "CREATE DATABASE \\"${dbName}\\";"`,
		);
		console.log(`✅ Database "${dbName}" created successfully`);
	} catch (error) {
		console.error(`❌ Failed to create database "${dbName}"`);
		if (error instanceof Error) {
			console.error(`   ${error.message}`);
		}
		throw error;
	}
}

/**
 * Clean up PostgreSQL URL for pg_dump/psql
 * - Removes query parameters after /postgres
 * - Changes port 6432 to 5432
 */
function cleanUrl(url: string): string {
	// Remove everything after /postgres (including query params)
	let cleaned = url.replace(/\/postgres\?.*$/, "/postgres");

	// Replace port 6432 with 5432
	cleaned = cleaned.replace(/:6432\//, ":5432/");

	return cleaned;
}

/**
 * Get customer table row count
 */
async function getCustomerCount(
	url: string,
): Promise<{ count: number | null; error?: string }> {
	try {
		const cleanedUrl = cleanUrl(url);
		const { stdout } = await execAsync(
			`psql "${cleanedUrl}" -t -c "SELECT COUNT(*) FROM customers;"`,
		);
		const count = parseInt(stdout.trim());
		if (!Number.isNaN(count)) {
			return { count };
		}
		return { count: null, error: "Could not parse customer count" };
	} catch (error) {
		// Table might not exist or connection failed
		return {
			count: null,
			error: error instanceof Error ? error.message : "Unknown error",
		};
	}
}

/**
 * Read DATABASE_URL from server/.env file
 */
function readLocalDatabaseUrl(): string | null {
	try {
		const envPath = join(process.cwd(), "server", ".env");
		const envContent = readFileSync(envPath, "utf-8");
		const lines = envContent.split("\n");

		for (const line of lines) {
			const trimmed = line.trim();
			if (trimmed.startsWith("DATABASE_URL=")) {
				const url = trimmed.replace(/^DATABASE_URL=/, "").trim();
				// Remove quotes if present
				return url.replace(/^["']|["']$/g, "");
			}
		}

		return null;
	} catch {
		return null;
	}
}

/**
 * Pull database from remote to local
 */
async function pullDatabase({
	remoteUrl,
	localUrl: providedLocalUrl,
}: {
	remoteUrl: string;
	localUrl?: string;
}) {
	console.log("\n📥 Pulling Remote Database to Local\n");

	// Validate remote URL
	if (!validatePostgresUrl(remoteUrl)) {
		console.error("❌ Invalid remote database URL");
		console.error(
			"   Expected format: postgresql://user:pass@host:port/dbname",
		);
		process.exit(1);
	}

	// Get local database URL (from argument, env var, or .env file)
	const localUrl =
		providedLocalUrl ||
		process.env.LOCAL_DATABASE_URL ||
		readLocalDatabaseUrl();

	if (!localUrl) {
		console.error("❌ Could not find local database URL");
		console.error("   Options:");
		console.error("   1. Ensure server/.env exists and contains DATABASE_URL");
		console.error("   2. Pass local URL as second argument");
		console.error("   3. Set LOCAL_DATABASE_URL environment variable");
		process.exit(1);
	}

	if (!validatePostgresUrl(localUrl)) {
		console.error("❌ Invalid local database URL in server/.env");
		console.error(
			"   Expected format: postgresql://user:pass@host:port/dbname",
		);
		process.exit(1);
	}

	const remoteDbName = extractDbName(remoteUrl);
	const localDbName = extractDbName(localUrl);

	console.log(`📤 Remote:  ${remoteDbName}`);
	console.log(`📥 Local:   ${localDbName}`);

	// Ensure local database exists
	console.log("\n🔍 Checking if local database exists...");
	await ensureDatabaseExists(localUrl, localDbName);

	// Check local database for production data
	console.log("\n🔍 Checking local database contents...");
	const customerResult = await getCustomerCount(localUrl);

	if (customerResult.count === null) {
		// Table doesn't exist or can't query - likely a new/empty database
		console.log("✅ Local database appears to be empty (no customers table)");
	} else {
		console.log(`📊 Local database has ${customerResult.count} customers`);

		// Protection: Don't allow overwriting databases with > 1000 customers
		if (customerResult.count > 1000) {
			console.error("\n❌ PROTECTION: Local database has too many customers!");
			console.error(
				`   Customer count (${customerResult.count}) exceeds 1000 limit.`,
			);
			console.error(
				"   This safety check prevents accidental overwrites of production databases.\n",
			);
			process.exit(1);
		}
	}

	// Ask for confirmation
	const confirmed = await promptUser(
		"\n⚠️  This will OVERWRITE your local database. Continue? (y/n): ",
	);

	if (!confirmed) {
		console.log("\n❌ Pull cancelled\n");
		process.exit(0);
	}

	const tempFile = `/tmp/db_dump_${Date.now()}.sql`;

	// Clean URLs
	const cleanedRemoteUrl = cleanUrl(remoteUrl);
	const cleanedLocalUrl = cleanUrl(localUrl);

	console.log(`\n📤 Using remote URL: ${cleanedRemoteUrl}`);
	console.log(`📥 Using local URL: ${cleanedLocalUrl}\n`);

	try {
		// Step 1: Dump the remote database
		console.log("📦 Dumping remote database...");
		await execWithOutput(
			`pg_dump "${cleanedRemoteUrl}" --no-owner --no-privileges -f "${tempFile}" 2>&1`,
		);
		console.log("✅ Remote database dumped successfully");

		// Step 2: Restore to local database
		console.log("\n📥 Restoring to local database...\n");
		await execWithOutput(
			`psql "${cleanedLocalUrl}" -f "${tempFile}" --set ON_ERROR_STOP=off 2>&1 | grep -v "invalid command"`,
		);
		console.log("\n✅ Database restored successfully");

		// Step 3: Clean up temp file
		console.log("\n🧹 Cleaning up temporary files...");
		await execAsync(`rm "${tempFile}"`);
		console.log("✅ Cleanup complete");

		console.log("\n✨ Database pull completed successfully!\n");
	} catch (error) {
		console.error("\n❌ Pull failed:");
		if (error instanceof Error) {
			console.error(`   ${error.message}\n`);
		}

		// Try to clean up temp file
		try {
			await execAsync(`rm "${tempFile}"`);
		} catch {
			// Ignore cleanup errors
		}

		process.exit(1);
	}
}

// Parse command line arguments or environment variable
const args = process.argv.slice(2);
const remoteUrl =
	args[0] || process.env.REMOTE_DATABASE_URL || process.env.DATABASE_URL_REMOTE;
const localUrl = args[1] || process.env.LOCAL_DATABASE_URL;

if (!remoteUrl) {
	console.log("\n📥 Pull Remote Database to Local\n");
	console.log("Usage:");
	console.log('  bun db:pull "<remote-database-url>" [local-database-url]\n');
	console.log("Arguments:");
	console.log(
		"  remote-database-url  (required) Remote database URL to pull from",
	);
	console.log(
		"  local-database-url   (optional) Local database URL to pull into",
	);
	console.log(
		"                        If not provided, reads from server/.env DATABASE_URL\n",
	);
	console.log("Environment variables:");
	console.log("  REMOTE_DATABASE_URL  Remote database URL");
	console.log("  LOCAL_DATABASE_URL   Local database URL (overrides .env)\n");
	console.log("Examples:");
	console.log('  bun db:pull "postgresql://user:pass@remote-host:5432/db"');
	console.log('  bun db:pull "postgresql://remote..." "postgresql://local..."');
	console.log('  REMOTE_DATABASE_URL="postgresql://..." bun db:pull\n');
	console.log("⚠️  Important: URLs must be quoted to prevent shell expansion\n");
	console.log(
		"By default, the script reads DATABASE_URL from server/.env for the local database.\n",
	);
	process.exit(1);
}

pullDatabase({ remoteUrl, localUrl }).catch((error) => {
	console.error("Unexpected error:", error);
	process.exit(1);
});
