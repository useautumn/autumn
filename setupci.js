#!/usr/bin/env node
import { randomBytes } from "crypto";
import { writeFileSync, copyFileSync } from "fs";
import chalk from "chalk";

const genUrlSafeBase64 = (bytes) => {
	return randomBytes(bytes)
		.toString("base64")
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/g, "");
};

async function main() {
	// Step 1: Generate secrets
	console.log(
		chalk.magentaBright("\n================ Autumn Setup ================\n"),
	);
	const secrets = {
		BETTER_AUTH_SECRET: genUrlSafeBase64(64),
		ENCRYPTION_IV: process.env.ENCRYPTION_IV,
		ENCRYPTION_PASSWORD: process.env.ENCRYPTION_PASSWORD,
		BETTER_AUTH_URL: "http://localhost:8080",
		CLIENT_URL: "http://localhost:3000",
		LOCALTUNNEL_RESERVED_KEY: process.env.LOCALTUNNEL_RESERVED_KEY,
		STRIPE_WEBHOOK_URL: process.env.STRIPE_WEBHOOK_URL,
	};

	let databaseUrl = process.env.DATABASE_URL;
	let stripeWebhookVars = [];
	// stripeWebhookVars = await handleLocalRunSetup();

	// Step 11: Write to server/.env
	console.log(
		chalk.magentaBright("\n================ Writing .env ================\n"),
	);
	const envSections = [];

	// Autumn Auth section
	envSections.push(
		"# Auth",
		`BETTER_AUTH_SECRET=${secrets.BETTER_AUTH_SECRET}`,
		`BETTER_AUTH_URL=${secrets.BETTER_AUTH_URL}`,
		`CLIENT_URL=${secrets.CLIENT_URL}`,
		"",
	);

	// Stripe required section
	envSections.push(
		"# Stripe",
		`LOCALTUNNEL_RESERVED_KEY=${secrets.LOCALTUNNEL_RESERVED_KEY}`,
		`ENCRYPTION_IV=${secrets.ENCRYPTION_IV}`,
		`ENCRYPTION_PASSWORD=${secrets.ENCRYPTION_PASSWORD}`,
		`STRIPE_WEBHOOK_URL=${secrets.STRIPE_WEBHOOK_URL}`,
		"",
	);

	// Database section
	if (databaseUrl) {
		envSections.push("# Database", `DATABASE_URL=${databaseUrl}`, "");
	}

	// Stripe Webhooks section
	if (stripeWebhookVars.length > 0) {
		envSections.push("# Stripe Webhooks");
		envSections.push(...stripeWebhookVars);
		envSections.push("");
	}

	const envVars = envSections.join("\n");

	writeFileSync("server/.env", envVars);
	try {
		copyFileSync("vite/.env.example", "vite/.env");
	} catch (error) {
		console.log(chalk.red("❌ Failed to copy vite/.env.example to vite/.env"));
		console.log(chalk.red("❌ Please copy the file manually"));
	}

	console.log(chalk.greenBright("🎉 Setup complete! 🎉"));
	console.log(chalk.cyan("You can find your env variables in server/.env"));

	console.log(chalk.cyan("\nNext steps:"));
	console.log(chalk.cyan("Run the following command to start Autumn:"));
	console.log(chalk.cyan("  docker compose -f docker-compose.dev.yml up"));
}

main();
