import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "dotenv";

/** Later files never override earlier ones; process.env always wins. */
const FILES_IN_PRECEDENCE_ORDER = [".env.local", ".env"] as const;

export type AutumnKeys = {
	sandboxKey?: string;
	prodKey?: string;
};

/**
 * Reads `.env.local` then `.env` into process.env without clobbering anything
 * already set, so injected secrets (Doppler, Infisical, CI) keep priority.
 * Mirrors v2's precedence: process.env → .env.local → .env.
 */
export const loadEnvFiles = ({ dirs }: { dirs: string[] }): string[] => {
	const loaded: string[] = [];

	for (const dir of dirs) {
		for (const file of FILES_IN_PRECEDENCE_ORDER) {
			const path = join(dir, file);
			if (!existsSync(path)) continue;

			try {
				for (const [key, value] of Object.entries(
					parse(readFileSync(path, "utf8")),
				)) {
					if (process.env[key] === undefined) process.env[key] = value;
				}
				loaded.push(path);
			} catch {
				// An unreadable or malformed .env is not fatal — the key may well
				// be in the real environment already.
			}
		}
	}

	return loaded;
};

export const readAutumnKeys = (): AutumnKeys => ({
	sandboxKey: process.env.AUTUMN_SECRET_KEY,
	prodKey: process.env.AUTUMN_PROD_SECRET_KEY,
});
