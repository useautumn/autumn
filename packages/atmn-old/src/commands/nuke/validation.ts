/**
 * Nuke command validation
 * Ensures safety checks before deletion
 */

import { AppEnv, getEnvironmentFromKey } from "../../lib/env/detect.js";

export class NukeValidationError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "NukeValidationError";
	}
}

/**
 * Validate that the key is sandbox-only
 * Throws error if production key detected
 */
export function validateSandboxOnly(key: string): void {
	const env = getEnvironmentFromKey(key);

	if (env !== AppEnv.Sandbox) {
		throw new NukeValidationError(
			"🚨 NUKE BLOCKED: Cannot nuke production!\n\n" +
				"This command only works in sandbox environment.\n" +
				`Current environment: ${env}\n\n` +
				"To nuke your sandbox:\n" +
				"1. Use your sandbox key (AUTUMN_SECRET_KEY)\n" +
				"2. Make sure it starts with 'ask_test_'\n\n" +
				"Aborting for your safety.",
		);
	}
}

/**
 * Validate customer count is within limits
 */
export function validateCustomerLimit(
	customerCount: number,
	maxCustomers: number = 50,
): void {
	if (customerCount > maxCustomers) {
		throw new NukeValidationError(
			`❌ Too Many Customers\n\n` +
				`You have ${customerCount} customers in your sandbox.\n` +
				`Maximum allowed for nuke: ${maxCustomers}\n\n` +
				`Why this limit?\n` +
				`• Prevents accidental mass deletion\n` +
				`• Ensures reasonable deletion time\n` +
				`• Encourages cleanup via dashboard\n\n` +
				`Options:\n` +
				`1. Delete some customers via dashboard\n` +
				`2. Increase limit: ATMN_NUKE_MAX_CUSTOMERS=${customerCount}\n` +
				`3. Contact support for bulk deletion\n\n` +
				`Aborting.`,
		);
	}
}

/**
 * Get max customers from environment or use default
 */
export function getMaxCustomers(): number {
	const envValue = process.env['ATMN_NUKE_MAX_CUSTOMERS'];
	if (envValue) {
		const parsed = parseInt(envValue, 10);
		if (!Number.isNaN(parsed) && parsed > 0) {
			return parsed;
		}
	}
	return 50; // Default limit
}
