import { readFileSync } from "node:fs";
import { totalmem } from "node:os";

const CGROUP_V2_LIMIT = "/sys/fs/cgroup/memory.max";
const CGROUP_V1_LIMIT = "/sys/fs/cgroup/memory/memory.limit_in_bytes";
const CGROUP_V1_UNLIMITED = 2 ** 60;

function readLimitFile({ path }: { path: string }): string | null {
	try {
		return readFileSync(path, "utf8");
	} catch {
		return null;
	}
}

function limitOf({ text }: { text: string | null }): number | null {
	if (text === null) return null;
	const value = Number(text.trim());
	if (!Number.isFinite(value) || value <= 0 || value >= CGROUP_V1_UNLIMITED)
		return null;
	return value;
}

/** The memory this process may use: the cgroup limit when the container has one, never more than the host holds. */
export function readContainerMemoryBytes({
	readFile = readLimitFile,
	totalMemory = totalmem,
}: {
	readFile?: (params: { path: string }) => string | null;
	totalMemory?: () => number;
} = {}): number | null {
	const host = totalMemory();
	const cgroup =
		limitOf({ text: readFile({ path: CGROUP_V2_LIMIT }) }) ??
		limitOf({ text: readFile({ path: CGROUP_V1_LIMIT }) });
	if (cgroup === null) return host > 0 ? host : null;
	return host > 0 ? Math.min(cgroup, host) : cgroup;
}
