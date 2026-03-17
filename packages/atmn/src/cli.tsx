#!/usr/bin/env node
/** biome-ignore-all lint/complexity/useLiteralKeys: necessary */
import chalk from "chalk";
import { program } from "commander";
import { render } from "ink";
import open from "open";
import React from "react";
import AuthCommand from "./commands/auth/command.js";
import Nuke from "./commands/nuke/legacyNuke.js";
import { pull as newPull } from "./commands/pull/pull.js"; // New pull implementation
import { FRONTEND_URL } from "./constants.js";
import { fetchOrganizationMe } from "./lib/api/endpoints/index.js";
import { isProd, setCliContext } from "./lib/env/cliContext.js";
import { readFromEnv } from "./lib/utils.js";
import { APP_VERSION } from "./lib/version.js";
// Import Ink views
import { QueryProvider } from "./views/react/components/providers/QueryProvider.js";
import { InitFlow } from "./views/react/init/InitFlow.js";
import { PullView } from "./views/react/pull/Pull.js";

program.version(APP_VERSION, "-v, --version");

// Global options - available for all commands
// These are orthogonal: -p controls env (sandbox vs live), -l controls API server (remote vs localhost)
// Combined as -lp: use live environment on localhost API server
program.option(
	"-p, --prod",
	"Use live/production environment (default: sandbox)",
);
program.option(
	"-l, --local",
	"Use localhost:8080 API server (default: api.useautumn.com)",
);
program.option("--headless", "Force non-interactive mode (for CI/agents)");
program.option(
	"-c, --config <path>",
	"Path to config file (default: autumn.config.ts)",
);

// Set CLI context before any command runs
// This allows combined flags like -lp to work correctly
program.hook("preAction", (thisCommand) => {
	const opts = thisCommand.opts();
	setCliContext({
		prod: opts["prod"] ?? false,
		local: opts["local"] ?? false,
		configPath: opts["config"],
	});

	// Override TTY detection if --headless flag is passed globally
	if (opts["headless"]) {
		process.stdout.isTTY = false;
	}
});
// === Existing commands (unchanged from source/cli.ts) ===

program
	.command("env")
	.description("Check the environment and organization info")
	.action(async () => {
		// Ensure API key is present
		const secretKey = readFromEnv();
		if (!secretKey) {
			console.error(
				chalk.red("No API key found. Run `atmn login` to authenticate."),
			);
			process.exit(1);
		}

		// Fetch organization info from API
		const orgInfo = await fetchOrganizationMe({ secretKey });

		const envDisplay = orgInfo.env === "sandbox" ? "Sandbox" : "Production";
		console.log(chalk.green(`Organization: ${orgInfo.name}`));
		console.log(chalk.green(`Slug: ${orgInfo.slug}`));
		console.log(chalk.green(`Environment: ${envDisplay}`));
	});

program
	.command("nuke")
	.description("Permanently nuke your sandbox.")
	.option(
		"--dangerously-skip-all-confirmation-prompts",
		"Skip all confirmation prompts (DANGEROUS)",
	)
	.action(async (options) => {
		const skipAllPrompts =
			options.dangerouslySkipAllConfirmationPrompts ?? false;
		// Nuke is sandbox-only - panic if prod flag is passed
		if (isProd()) {
			console.error(
				chalk.red.bold(
					"\n  ERROR: nuke command is only available for sandbox!\n",
				),
			);
			console.error(
				chalk.red(
					"  The nuke command permanently deletes all data and cannot be used on production.",
				),
			);
			console.error(
				chalk.red("  Remove the -p/--prod flag to nuke your sandbox.\n"),
			);
			process.exit(1);
		}

		if (process.stdout.isTTY && !skipAllPrompts) {
			// Interactive mode - use new beautiful Ink UI
			const { NukeView } = await import("./views/react/nuke/NukeView.js");
			render(
				<QueryProvider>
					<NukeView />
				</QueryProvider>,
			);
		} else {
			// Non-TTY mode or skip-all-prompts - use legacy command
			await Nuke({ skipAllPrompts });
		}
	});

program
	.command("push")
	.description("Push changes to Autumn")
	.option("-y, --yes", "Confirm all prompts automatically")
	.action(async (options) => {
		// Import AppEnv here to avoid circular dependencies
		const { AppEnv } = await import("./lib/env/index.js");
		const environment = isProd() ? AppEnv.Live : AppEnv.Sandbox;

		if (process.stdout.isTTY) {
			// Interactive mode - use new beautiful Ink UI
			const { PushView } = await import("./views/react/push/Push.js");
			render(
				<QueryProvider>
					<PushView
						environment={environment}
						yes={options.yes}
						onComplete={() => {
							process.exit(0);
						}}
					/>
				</QueryProvider>,
			);
		} else {
			// Non-TTY mode - use headless push with V2 logic
			const { headlessPush } = await import("./commands/push/headless.js");
			const { formatError } = await import("./lib/api/client.js");
			try {
				await headlessPush({
					cwd: process.cwd(),
					environment,
					yes: options.yes,
				});
			} catch (error) {
				console.error(chalk.red(`\nError: ${formatError(error)}`));
				process.exit(1);
			}
		}
	});

program
	.command("pull")
	.description("Pull changes from Autumn")
	.option("-f, --force", "Force overwrite config (skip in-place update)")
	.option("--no-declaration-file", "Skip generating @useautumn-sdk.d.ts")
	.action(async (options) => {
		// Import AppEnv here to avoid circular dependencies
		const { AppEnv } = await import("./lib/env/index.js");
		const environment = isProd() ? AppEnv.Live : AppEnv.Sandbox;

		// --no-declaration-file → skip; otherwise check global config
		const { getGlobalConfig } = await import("./commands/config/command.js");
		const skipDts =
			options.declarationFile === false ||
			(getGlobalConfig().get("noDeclarationFile") === true);

		if (process.stdout.isTTY) {
			// Interactive mode - use beautiful Ink UI
			render(
				<QueryProvider>
					<PullView
						environment={environment}
						forceOverwrite={options.force}
						noDeclarationFile={skipDts}
						onComplete={() => {
							process.exit(0);
						}}
					/>
				</QueryProvider>,
			);
		} else {
			// Non-TTY (CI/agent mode) - use plain text
			console.log(`Pulling plans and features from Autumn (${environment})...`);

			try {
				const result = await newPull({
					generateSdkTypes: true,
					cwd: process.cwd(),
					environment,
					forceOverwrite: options.force,
					noDeclarationFile: skipDts,
				});

				console.log(
					chalk.green(
						`✓ Pulled ${result.features.length} features, ${result.plans.length} plans from ${environment}`,
					),
				);

				// Show in-place update details
				if (result.inPlace && result.updateResult) {
					const {
						featuresUpdated,
						featuresAdded,
						featuresDeleted,
						plansUpdated,
						plansAdded,
						plansDeleted,
					} = result.updateResult;
					console.log(
						chalk.cyan(
							`  In-place update: ${featuresUpdated} features updated, ${featuresAdded} added, ${featuresDeleted} deleted`,
						),
					);
					console.log(
						chalk.cyan(
							`                   ${plansUpdated} plans updated, ${plansAdded} added, ${plansDeleted} deleted`,
						),
					);
				}

				if (result.sdkTypesPath) {
					console.log(
						chalk.green(`✓ Generated SDK types at: ${result.sdkTypesPath}`),
					);
				}
			} catch (error) {
				const { formatError } = await import("./lib/api/client.js");
				console.error(
					chalk.red(`\nError pulling from Autumn: ${formatError(error)}`),
				);
				process.exit(1);
			}
		}
	});

program
	.command("init")
	.description("Initialize an Autumn project.")
	.action(async () => {
		if (process.stdout.isTTY) {
			// Interactive mode - use new Ink-based init flow
			render(
				<QueryProvider>
					<InitFlow />
				</QueryProvider>,
			);
		} else {
			// Non-TTY (agent/CI mode) - use headless init flow
			const { HeadlessInitFlow } = await import(
				"./views/react/init/HeadlessInitFlow.js"
			);
			render(
				<QueryProvider>
					<HeadlessInitFlow />
				</QueryProvider>,
			);
		}
	});

program
	.command("login")
	.description("Authenticate with Autumn")
	.action(async () => {
		if (process.stdout.isTTY) {
			// Interactive mode - use new beautiful Ink UI
			const { LoginView } = await import("./views/react/login/LoginView.js");
			render(
				<QueryProvider>
					<LoginView
						onComplete={() => {
							process.exit(0);
						}}
					/>
				</QueryProvider>,
			);
		} else {
			// Non-TTY mode - use legacy command with URL fallback
			await AuthCommand();
		}
	});

program
	.command("logout")
	.description("Remove Autumn API keys from your .env file")
	.action(async () => {
		const { removeKeysFromEnv } = await import("./lib/env/dotenv.js");

		const removed = removeKeysFromEnv([
			"AUTUMN_SECRET_KEY",
			"AUTUMN_PROD_SECRET_KEY",
		]);

		if (removed.length === 0) {
			console.log(chalk.yellow("No Autumn keys found in .env file."));
		} else {
			console.log(chalk.green(`Removed ${removed.join(", ")} from .env file.`));
		}
	});

program
	.command("dashboard")
	.description("Open the Autumn dashboard in your browser")
	.action(() => {
		open(`${FRONTEND_URL}`);
	});

program
	.command("version")
	.alias("v")
	.description("Show the version of Autumn")
	.action(() => {
		console.log(APP_VERSION);
	});

program
	.command("customers")
	.description("Browse and inspect customers")
	.option("--headless", "Run in headless mode (output for AI/agents)")
	.option("--page <n>", "Page number (headless)", "1")
	.option("--search <query>", "Search query (headless)")
	.option("--id <id>", "Get customer by ID (headless)")
	.option("--limit <n>", "Items per page (headless)", "50")
	.option(
		"--format <format>",
		"Output format: text, json, csv (headless)",
		"text",
	)
	.action(async (options) => {
		const { customersCommand } = await import("./commands/customers/index.js");
		await customersCommand({
			prod: isProd(),
			headless: options.headless,
			page: Number.parseInt(options.page, 10),
			search: options.search,
			id: options.id,
			limit: Number.parseInt(options.limit, 10),
			format: options.format,
		});
	});

program
	.command("products")
	.alias("plans")
	.description("Browse and inspect products/plans")
	.option("--headless", "Run in headless mode (output for AI/agents)")
	.option("--page <n>", "Page number (headless)", "1")
	.option("--search <query>", "Search query (headless)")
	.option("--id <id>", "Get product by ID (headless)")
	.option("--limit <n>", "Items per page (headless)", "50")
	.option(
		"--format <format>",
		"Output format: text, json, csv (headless)",
		"text",
	)
	.option("--include-archived", "Include archived products")
	.action(async (options) => {
		const { productsCommand } = await import("./commands/products/index.js");
		await productsCommand({
			prod: isProd(),
			headless: options.headless,
			page: Number.parseInt(options.page, 10),
			search: options.search,
			id: options.id,
			limit: Number.parseInt(options.limit, 10),
			format: options.format,
			includeArchived: options.includeArchived,
		});
	});

program
	.command("features")
	.description("Browse and inspect features")
	.option("--headless", "Run in headless mode (output for AI/agents)")
	.option("--page <n>", "Page number (headless)", "1")
	.option("--search <query>", "Search query (headless)")
	.option("--id <id>", "Get feature by ID (headless)")
	.option("--limit <n>", "Items per page (headless)", "50")
	.option(
		"--format <format>",
		"Output format: text, json, csv (headless)",
		"text",
	)
	.option("--include-archived", "Include archived features")
	.action(async (options) => {
		const { featuresCommand } = await import("./commands/features/index.js");
		await featuresCommand({
			prod: isProd(),
			headless: options.headless,
			page: Number.parseInt(options.page, 10),
			search: options.search,
			id: options.id,
			limit: Number.parseInt(options.limit, 10),
			format: options.format,
			includeArchived: options.includeArchived,
		});
	});

program
	.command("preview")
	.description("Preview plans from autumn.config.ts")
	.option("--plan <id>", "Preview a specific plan by ID")
	.option(
		"--currency <code>",
		"Currency for price display (default: USD)",
		"USD",
	)
	.action(async (options) => {
		const { previewCommand } = await import("./commands/preview/index.js");
		await previewCommand({
			planId: options.plan,
			currency: options.currency,
			cwd: process.cwd(),
		});
	});

program
	.command("events")
	.description("Browse and inspect usage events")
	.option("--headless", "Run in headless mode (output for AI/agents)")
	.option("--page <n>", "Page number", "1")
	.option("--customer <id>", "Filter by customer ID")
	.option(
		"--feature <id>",
		"Filter by feature ID (comma-separated for multiple)",
	)
	.option("--limit <n>", "Items per page", "100")
	.option("--time <range>", "Time range: 24h, 7d, 30d, 90d", "7d")
	.option("--mode <mode>", "View mode: list, aggregate", "list")
	.option("--bin <size>", "Bin size for aggregate: hour, day, month")
	.option("--group-by <property>", "Group by property (aggregate mode)")
	.option("--format <format>", "Output format: text, json, csv", "text")
	.action(async (options) => {
		const { eventsCommand } = await import("./commands/events/index.js");
		await eventsCommand({
			prod: isProd(),
			headless: options.headless,
			page: Number.parseInt(options.page, 10),
			customerId: options.customer,
			featureId: options.feature,
			limit: Number.parseInt(options.limit, 10),
			timeRange: options.time,
			mode: options.mode,
			binSize: options.bin,
			groupBy: options.groupBy,
			format: options.format,
		});
	});
program
	.command("config")
	.description("Get and set global configuration")
	.option("-g, --global", "Use global config")
	.argument("[key]", "Config key")
	.argument("[value]", "Config value (omit to read)")
	.action(async (key, value, options) => {
		const { configCommand } = await import("./commands/config/command.js");
		const args = [key, value].filter((a) => a !== undefined);
		configCommand(args, { global: options.global });
	});

program
	.command("test-diff", { hidden: true })
	.description("Debug: show normalized diff between local config and remote")
	.action(async () => {
		const { testDiffCommand } = await import("./commands/test-diff/index.js");
		try {
			await testDiffCommand();
		} catch (error) {
			const { formatError } = await import("./lib/api/client.js");
			console.error(chalk.red(`\nError: ${formatError(error)}`));
			process.exit(1);
		}
	});

/**
 * This is a hack to silence the DeprecationWarning about url.parse()
 */
// biome-ignore lint/suspicious/noExplicitAny: expected
const originalEmit = process.emitWarning as any;
// biome-ignore lint/suspicious/noExplicitAny: expected
(process as any).emitWarning = (warning: any, ...args: any[]) => {
	const msg = typeof warning === "string" ? warning : warning.message;

	if (msg.includes("url.parse()")) {
		return;
	}

	return originalEmit(warning, ...args);
};

program.parse();
