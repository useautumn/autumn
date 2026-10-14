function envTruthy(value: string | undefined): boolean {
	return value === "1" || value === "true";
}

export function isCloudAgent({
	env = process.env,
}: {
	env?: Record<string, string | undefined>;
} = {}): boolean {
	return envTruthy(env.CLOUD_AGENT) || envTruthy(env.DW_HEADLESS);
}
