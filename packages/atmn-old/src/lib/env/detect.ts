export enum AppEnv {
	Sandbox = "sandbox",
	Live = "live",
}

export function getEnvironmentFromKey(key: string): AppEnv {
	if (key.includes("_test_")) {
		return AppEnv.Sandbox;
	}
	if (key.includes("_live_")) {
		return AppEnv.Live;
	}
	throw new Error(
		`Invalid API key format: must contain '_test_' (sandbox) or '_live_' (live)`,
	);
}

export function isSandboxKey(key: string): boolean {
	return key.includes("_test_");
}

export function isLiveKey(key: string): boolean {
	return key.includes("_live_");
}

export function isValidKey(key: string): boolean {
	return (
		typeof key === "string" &&
		key.length > 0 &&
		(isSandboxKey(key) || isLiveKey(key))
	);
}
