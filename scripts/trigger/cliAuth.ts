import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

type TriggerCliProfile = {
	accessToken?: string;
	apiUrl?: string;
};

type TriggerCliConfig = {
	currentProfile?: string;
	profiles?: Record<string, TriggerCliProfile>;
};

const CONFIG_CANDIDATES = [
	join(homedir(), "Library/Preferences/trigger/config.json"),
	join(homedir(), ".config/trigger/config.json"),
];

/** Personal access token from `trigger.dev login` (required for branch archive). */
export function readTriggerCliAuth(): {
	accessToken: string;
	apiUrl: string;
} {
	const accessToken = process.env.TRIGGER_ACCESS_TOKEN?.trim();
	if (accessToken) {
		return {
			accessToken,
			apiUrl: (
				process.env.TRIGGER_API_URL ?? "https://api.trigger.dev"
			).replace(/\/$/, ""),
		};
	}

	for (const path of CONFIG_CANDIDATES) {
		if (!existsSync(path)) continue;
		const config = JSON.parse(readFileSync(path, "utf-8")) as TriggerCliConfig;
		const profileName = config.currentProfile ?? "default";
		const profile = config.profiles?.[profileName] ?? config.profiles?.default;
		const accessToken = profile?.accessToken?.trim();
		if (!accessToken) continue;
		return {
			accessToken,
			apiUrl: (profile?.apiUrl ?? "https://api.trigger.dev").replace(/\/$/, ""),
		};
	}
	throw new Error(
		"Not logged in to Trigger.dev CLI. Run `bunx trigger.dev login` first.",
	);
}
