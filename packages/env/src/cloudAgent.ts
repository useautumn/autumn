function envTruthy(value: string | undefined): boolean {
	return value === "1" || value === "true";
}

/**
 * Cursor Cloud / Devin. `DW_HEADLESS` is the previous name — still honored so
 * already-booted VMs keep skipping Neon/portless until they re-export.
 */
export function isCloudAgent({
	env = process.env,
}: {
	env?: Record<string, string | undefined>;
} = {}): boolean {
	return envTruthy(env.CLOUD_AGENT) || envTruthy(env.DW_HEADLESS);
}
