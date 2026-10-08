import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const BOOT_ID_PATH = "/proc/sys/kernel/random/boot_id";

/** Inputs whose change since the last provision means migrations, SQL functions or env files are stale. */
const PROVISION_INPUT_DIRS = [
	{ dir: "shared/drizzle", suffix: ".sql" },
	{ dir: "server/src/internal/balances/utils/sql", suffix: ".sql" },
];
const PROVISION_INPUT_FILES = [
	"shared/drizzle/meta/_journal.json",
	"server/.env.local",
	"vite/.env.local",
	"apps/checkout/.env.local",
];

export function readBootId({
	path = BOOT_ID_PATH,
}: {
	path?: string;
} = {}): string | undefined {
	if (!existsSync(path)) return undefined;
	return readFileSync(path, "utf-8").trim() || undefined;
}

function provisionInputPaths({ repoRoot }: { repoRoot: string }): string[] {
	const fromDirs = PROVISION_INPUT_DIRS.flatMap(({ dir, suffix }) => {
		const abs = join(repoRoot, dir);
		if (!existsSync(abs)) return [];
		return readdirSync(abs)
			.filter((name) => name.endsWith(suffix))
			.map((name) => join(dir, name));
	});
	return [...fromDirs, ...PROVISION_INPUT_FILES].sort();
}

export function provisionFingerprint({
	repoRoot,
	bootId,
	machineId,
	optIns,
}: {
	repoRoot: string;
	bootId: string;
	machineId: string;
	optIns: string[];
}): string {
	const hash = createHash("sha256");
	hash.update(
		JSON.stringify({ bootId, machineId, optIns: [...optIns].sort() }),
	);
	for (const rel of provisionInputPaths({ repoRoot })) {
		const abs = join(repoRoot, rel);
		hash.update(`\0${rel}\0`);
		hash.update(existsSync(abs) ? readFileSync(abs) : "(missing)");
	}
	return hash.digest("hex");
}

export function isProvisionCurrent({
	stampPath,
	fingerprint,
}: {
	stampPath: string;
	fingerprint: string;
}): boolean {
	if (!existsSync(stampPath)) return false;
	return readFileSync(stampPath, "utf-8").trim() === fingerprint;
}

export function writeProvisionStamp({
	stampPath,
	fingerprint,
}: {
	stampPath: string;
	fingerprint: string;
}): void {
	writeFileSync(stampPath, `${fingerprint}\n`, { mode: 0o600 });
}
