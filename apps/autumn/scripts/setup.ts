import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
const repoRoot = join(root, "..", "..");

function log(msg: string) {
	console.log(`  ${msg}`);
}

function header(msg: string) {
	console.log(`\n${msg}`);
}

function checkPrerequisites() {
	header("Checking prerequisites...");

	if (!existsSync(join(repoRoot, "node_modules")) && !existsSync(join(root, "node_modules"))) {
		console.error("node_modules not found. Run `bun install` from the repo root first.");
		process.exit(1);
	}
	log("Dependencies installed");
}

function createEnvFile() {
	header("Setting up environment...");

	const envPath = join(root, ".env");
	const examplePath = join(root, ".env.example");

	if (existsSync(envPath)) {
		log(".env already exists, skipping");
		return;
	}

	if (!existsSync(examplePath)) {
		console.error(".env.example not found");
		process.exit(1);
	}

	let content = readFileSync(examplePath, "utf-8");

	const encryptionKey = randomBytes(32).toString("hex");
	content = content.replace("ENCRYPTION_KEY=", `ENCRYPTION_KEY=${encryptionKey}`);

	writeFileSync(envPath, content);
	log("Created .env with generated ENCRYPTION_KEY");
	log("Edit .env to add your Slack and Autumn credentials");
}

function printNextSteps() {
	header("Setup complete!\n");
	console.log("Next steps:\n");
	console.log("  1. Add your Slack, Autumn OAuth, and Anthropic credentials to .env\n");
	console.log("  2. Start Redis from the repo root:");
	console.log("     docker compose -f docker-compose.dev.yml up -d    # Windows");
	console.log("     docker compose -f docker-compose.unix.yml up -d   # macOS/Linux\n");
	console.log("  3. Start the app:");
	console.log("     bun dev\n");
	console.log("  4. Expose with a tunnel:");
	console.log("     ngrok http 3000\n");
	console.log("  5. Update Slack Event Subscriptions URL to:");
	console.log("     https://<tunnel>/webhooks/slack\n");
}

checkPrerequisites();
createEnvFile();
printNextSteps();
