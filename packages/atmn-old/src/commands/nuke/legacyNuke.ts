/**
 * Legacy nuke command for non-TTY environments
 * Uses new API infrastructure but provides inquirer-based prompts
 */

import fs from "node:fs";
import { confirm } from "@inquirer/prompts";
import chalk from "chalk";
import {
	type ApiCustomer,
	deleteCustomer,
	fetchCustomers,
} from "../../lib/api/endpoints/customers.js";
import {
	deleteFeature,
	fetchFeatures,
} from "../../lib/api/endpoints/features.js";
import { fetchOrganization } from "../../lib/api/endpoints/organization.js";
import { deletePlan, fetchPlans } from "../../lib/api/endpoints/plans.js";
import { AppEnv } from "../../lib/env/detect.js";
import { getKey } from "../../lib/env/index.js";
import { initSpinner, isSandboxKey, readFromEnv } from "../../lib/utils.js";
import {
	deleteCustomersBatch,
	deleteFeaturesBatch,
	deletePlansBatch,
} from "./deletions.js";
import { validateSandboxOnly } from "./validation.js";

async function promptAndConfirmNuke(orgName: string): Promise<boolean> {
	console.log(`\n${chalk.bgRed.white.bold("  DANGER: SANDBOX NUKE  ")}`);
	console.log(
		chalk.red(
			`This is irreversible. You are about to permanently delete all data from the organization ` +
				chalk.redBright.bold(orgName) +
				`\n\n` +
				`Items to be deleted:` +
				`\n  - ` +
				chalk.yellowBright("customers") +
				`\n  - ` +
				chalk.yellowBright("features") +
				`\n  - ` +
				chalk.yellowBright("plans") +
				`\n`,
		),
	);

	const backupConfirm = await confirm({
		message: `Would you like to backup your ${chalk.magentaBright.bold("autumn.config.ts")} file before proceeding? (Recommended)`,
		default: true,
	});

	const shouldProceed = await confirm({
		message: `Confirm to continue. This will delete ${chalk.redBright.bold("all")} your ${chalk.redBright.bold("plans")}, ${chalk.redBright.bold("features")} and ${chalk.redBright.bold("customers")} from your sandbox environment. You will confirm twice.`,
		default: false,
	});

	if (!shouldProceed) {
		console.log(chalk.red("Aborting..."));
		process.exit(1);
	}

	const finalConfirm = await confirm({
		message:
			"Final confirmation: Are you absolutely sure? This action is irreversible.",
		default: false,
	});

	if (!finalConfirm) {
		console.log(chalk.red("Aborting..."));
		process.exit(1);
	}

	return backupConfirm;
}

export default async function Nuke(options?: { skipAllPrompts?: boolean }) {
	const apiKey = readFromEnv();

	if (!apiKey) {
		console.log(chalk.red("No API key found. Run `atmn login` first."));
		process.exit(1);
	}

	const isSandbox = await isSandboxKey(apiKey);

	if (isSandbox) {
		const secretKey = getKey(AppEnv.Sandbox);

		// Validate sandbox-only
		try {
			validateSandboxOnly(secretKey);
		} catch (error) {
			console.log(
				chalk.red(error instanceof Error ? error.message : String(error)),
			);
			process.exit(1);
		}

		const org = await fetchOrganization({ secretKey });

		let backupConfirm = false;
		if (options?.skipAllPrompts) {
			console.log(
				chalk.yellow(
					"⚠ Skipping all confirmation prompts (--dangerously-skip-all-confirmation-prompts)",
				),
			);
		} else {
			backupConfirm = await promptAndConfirmNuke(org.name);
		}

		if (backupConfirm) {
			try {
				fs.copyFileSync("autumn.config.ts", "autumn.config.ts.backup");
				console.log(chalk.green("Backup created successfully!"));
			} catch {
				console.log(
					chalk.yellow("Could not create backup (file may not exist)"),
				);
			}
		}

		console.log(chalk.red("Nuking sandbox..."));

		const s = initSpinner(
			`Preparing ${chalk.yellowBright("customers")}, ${chalk.yellowBright("features")} and ${chalk.yellowBright("plans")} for deletion...`,
		);

		const plans = await fetchPlans({ secretKey, includeArchived: true });
		const features = await fetchFeatures({ secretKey });
		const customers = await fetchCustomers({ secretKey });

		s.success(
			`Loaded all ${chalk.yellowBright("customers")}, ${chalk.yellowBright("features")} and ${chalk.yellowBright("plans")} for deletion`,
		);

		try {
			// Delete customers (parallel - independent)
			const customerSpinner = initSpinner("Deleting customers...");
			await deleteCustomersBatch(
				customers.map((c: ApiCustomer) => ({ id: c.id })),
				async (id: string) => {
					await deleteCustomer({ secretKey, customerId: id });
				},
				(progress) => {
					customerSpinner.text = `Deleting customers: ${progress.current}/${progress.total}`;
				},
			);
			customerSpinner.success("Customers deleted successfully!");

			// Delete plans (parallel - independent)
			const planSpinner = initSpinner("Deleting plans...");
			await deletePlansBatch(
				plans.map((p) => ({ id: p.id })),
				async (id: string, allVersions: boolean) => {
					await deletePlan({ secretKey, planId: id, allVersions });
				},
				(progress) => {
					planSpinner.text = `Deleting plans: ${progress.current}/${progress.total}`;
				},
			);
			planSpinner.success("Plans deleted successfully!");

			// Delete features (credit systems first in parallel, then rest in parallel)
			const featureSpinner = initSpinner("Deleting features...");
			await deleteFeaturesBatch(
				features.map((f) => ({ id: f.id, type: f.type })),
				async (id: string) => {
					await deleteFeature({ secretKey, featureId: id });
				},
				(progress) => {
					featureSpinner.text = `Deleting features: ${progress.current}/${progress.total}`;
				},
			);
			featureSpinner.success("Features deleted successfully!");
		} catch (e: unknown) {
			console.error(chalk.red("Failed to nuke sandbox:"));
			console.error(e);
			process.exit(1);
		}

		console.log(chalk.green("Sandbox nuked successfully!"));
	} else {
		console.log(chalk.red`You can't nuke a prod environment!`);
		process.exit(1);
	}
}
