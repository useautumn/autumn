import { existsSync, readFileSync, writeFileSync } from "node:fs";
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

/** The file `loadEnvFiles` reads first, so writes land where reads look. */
export const findEnvFile = ({
	dirs,
}: {
	dirs: string[];
}): string | undefined => {
	for (const dir of dirs) {
		for (const file of FILES_IN_PRECEDENCE_ORDER) {
			const path = join(dir, file);
			if (existsSync(path)) return path;
		}
	}
	return undefined;
};

const isAssignmentFor = ({
	line,
	key,
}: {
	line: string;
	key: string;
}): boolean => line.trimStart().startsWith(`${key}=`);

/** Rewrites keys in place and appends the rest; every other line survives. */
export const upsertEnvContent = ({
	content,
	values,
}: {
	content: string;
	values: Record<string, string>;
}): string => {
	const trimmed = content.endsWith("\n") ? content.slice(0, -1) : content;
	const lines = trimmed === "" ? [] : trimmed.split("\n");

	for (const [key, value] of Object.entries(values)) {
		const index = lines.findIndex((line) => isAssignmentFor({ line, key }));
		if (index === -1) lines.push(`${key}=${value}`);
		else lines[index] = `${key}=${value}`;
	}

	return `${lines.join("\n")}\n`;
};

export const writeEnvValues = ({
	dirs,
	values,
}: {
	dirs: string[];
	values: Record<string, string>;
}): string => {
	const path = findEnvFile({ dirs }) ?? join(dirs[0] ?? process.cwd(), ".env");
	const content = existsSync(path) ? readFileSync(path, "utf8") : "";

	writeFileSync(path, upsertEnvContent({ content, values }));
	return path;
};
