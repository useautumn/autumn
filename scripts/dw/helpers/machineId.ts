import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export function agentDir({ home }: { home?: string } = {}): string {
	return join(home ?? homedir(), ".autumn-agent");
}

/** Stable per-machine salt so reserved ngrok names do not collide on shared paths. */
export function machineId({ home }: { home?: string } = {}): string {
	const dir = agentDir({ home });
	const path = join(dir, "machine-id");
	if (existsSync(path)) {
		const existing = readFileSync(path, "utf8").trim();
		if (existing) return existing;
	}
	mkdirSync(dir, { recursive: true });
	const id = randomBytes(8).toString("hex");
	writeFileSync(path, `${id}\n`, { mode: 0o600 });
	return id;
}
