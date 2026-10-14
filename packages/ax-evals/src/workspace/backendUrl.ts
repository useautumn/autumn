import { readFileSync } from "node:fs";
import { join } from "node:path";
import { AX_EVALS_DIR } from "./workspacePaths.ts";

export const evalBackendUrl = (): string => {
	if (process.env.AX_EVALS_BACKEND_URL) return process.env.AX_EVALS_BACKEND_URL;
	try {
		const envLocal = readFileSync(
			join(AX_EVALS_DIR, "../../server/.env.local"),
			"utf8",
		);
		const match = envLocal.match(/^AUTUMN_TEST_BASE_URL=(.+)$/m);
		if (match?.[1]) return match[1].trim();
	} catch {
	}
	return "http://localhost:8080";
};

export const assertBackendReachable = async (url: string): Promise<void> => {
	try {
		await fetch(url, { signal: AbortSignal.timeout(3000) });
	} catch {
		throw new Error(
			`Autumn dev server unreachable at ${url} — start it with \`bun dw\` (or set AX_EVALS_BACKEND_URL)`,
		);
	}
};
