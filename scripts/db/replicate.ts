import { exec, spawn } from "node:child_process";
import readline from "node:readline";
import { promisify } from "node:util";

const execAsync = promisify(exec);

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

function validatePostgresUrl(url: string): boolean {
	return url.startsWith("postgresql://") || url.startsWith("postgres://");
}

function extractDbName(url: string): string {
	try {
		const urlObj = new URL(url);
		return urlObj.pathname.slice(1) || "database";
	} catch {
		return "database";
	}
}

function cleanUrl(url: string): string {
	let cleaned = url.replace(/\/postgres\?.*$/, "/postgres");

	cleaned = cleaned.replace(/:6432\//, ":5432/");

	return cleaned;
}

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
		return {
			count: null,
			error: error instanceof Error ? error.message : "Unknown error",
		};
	}
}

async function replicateDatabase({
	fromUrl,
	toUrl,
}: {
	fromUrl: string;
	toUrl: string;
}) {
	console.log("\n🔄 PostgreSQL Database Replication\n");

	if (!validatePostgresUrl(fromUrl)) {
		console.error("❌ Invalid source database URL");
		console.error(
			"   Expected format: postgresql://user:pass@host:port/dbname",
		);
		process.exit(1);
	}

	if (!validatePostgresUrl(toUrl)) {
		console.error("❌ Invalid destination database URL");
		console.error(
			"   Expected format: postgresql://user:pass@host:port/dbname",
		);
		process.exit(1);
	}

	const fromDbName = extractDbName(fromUrl);
	const toDbName = extractDbName(toUrl);

	console.log(`📤 Source:      ${fromDbName}`);
	console.log(`📥 Destination: ${toDbName}`);

	console.log("\n🔍 Checking destination database...");
	const customerResult = await getCustomerCount(toUrl);

	if (customerResult.count === null) {
		console.log("✅ Destination appears to be empty (no customers table)");
	} else {
		console.log(`📊 Destination has ${customerResult.count} customers`);

		if (customerResult.count > 1000) {
			console.error(
				"\n❌ PROTECTION: Destination database has too many customers!",
			);
			console.error(
				`   Customer count (${customerResult.count}) exceeds 1000 limit.`,
			);
			console.error(
				"   This safety check prevents accidental overwrites of production databases.\n",
			);
			process.exit(1);
		}
	}

	const confirmed = await promptUser(
		"\n⚠️  This will OVERWRITE the destination database. Continue? (y/n): ",
	);

	if (!confirmed) {
		console.log("\n❌ Replication cancelled\n");
		process.exit(0);
	}

	const tempFile = `/tmp/db_dump_${Date.now()}.sql`;

	const cleanedFromUrl = cleanUrl(fromUrl);
	const cleanedToUrl = cleanUrl(toUrl);

	console.log(`\n📤 Using source URL: ${cleanedFromUrl}`);
	console.log(`📥 Using destination URL: ${cleanedToUrl}\n`);

	try {
		console.log("📦 Dumping source database...");
		await execWithOutput(
			`pg_dump "${cleanedFromUrl}" --no-owner --no-privileges --exclude-schema='ddb$*' -f "${tempFile}" 2>&1`,
		);
		console.log("✅ Source database dumped successfully");

		console.log("\n📥 Restoring to destination database...\n");
		await execWithOutput(
			`psql "${cleanedToUrl}" -f "${tempFile}" --set ON_ERROR_STOP=off 2>&1 | grep -v "invalid command"`,
		);
		console.log("\n✅ Database restored successfully");

		console.log("\n🧹 Cleaning up temporary files...");
		await execAsync(`rm "${tempFile}"`);
		console.log("✅ Cleanup complete");

		console.log("\n✨ Database replication completed successfully!\n");
	} catch (error) {
		console.error("\n❌ Replication failed:");
		if (error instanceof Error) {
			console.error(`   ${error.message}\n`);
		}

		try {
			await execAsync(`rm "${tempFile}"`);
		} catch {}

		process.exit(1);
	}
}

function parseUrls(): { fromUrl: string; toUrl: string } | null {
	const args = process.argv.slice(2);

	if (args.length === 0) {
		return null;
	}

	const fullString = args.join(" ");

	const urlPattern =
		/(postgres(?:ql)?:\/\/[^\s]+?)[\s]+(postgres(?:ql)?:\/\/[^\s]+)/;
	const match = fullString.match(urlPattern);

	if (match?.[1] && match[2]) {
		return {
			fromUrl: match[1],
			toUrl: match[2],
		};
	}

	if (args.length === 2) {
		const [fromUrl, toUrl] = args;
		if (
			validatePostgresUrl(fromUrl || "") &&
			validatePostgresUrl(toUrl || "")
		) {
			return { fromUrl, toUrl };
		}
	}

	return null;
}

const urls = parseUrls();

if (!urls) {
	console.log("\n🔄 PostgreSQL Database Replication\n");
	console.log("Usage:");
	console.log('  bun replicate "<from-url>" "<to-url>"\n');
	console.log("Example:");
	console.log(
		'  bun replicate "postgresql://user:pass@eu-host:5432/db" "postgresql://user:pass@us-host:5432/db"\n',
	);
	console.log("⚠️  Important: URLs must be quoted to prevent shell expansion\n");
	console.log("Tip: Store URLs in .env and use environment variables:\n");
	console.log("  bun replicate $EU_DATABASE_URL $US_DATABASE_URL\n");
	process.exit(1);
}

const { fromUrl, toUrl } = urls;

replicateDatabase({ fromUrl, toUrl }).catch((error) => {
	console.error("Unexpected error:", error);
	process.exit(1);
});
