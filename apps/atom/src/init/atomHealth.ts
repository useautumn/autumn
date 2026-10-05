import { readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** Set by the supervisor on every child, so /health reports the container's boot, not the child's. */
export const ATOM_BOOTED_AT = "ATOM_BOOTED_AT";
/** Where the supervisor keeps its respawn count; children read it, so any of them can answer /health. */
export const ATOM_RESTARTS_FILE = "ATOM_RESTARTS_FILE";

/** /health is polled, so the restarts file is read at most this often per process. */
const RESTARTS_READ_EVERY_MS = 1000;

export type AtomHealth = {
	status: "alive";
	bootedAt: string;
	restarts: number;
};

/** Run by the supervisor before it starts children: marks the boot and opens the count at 0. */
export const markAtomBoot = ({
	env = process.env,
	now = () => new Date(),
	restartsFile = join(tmpdir(), `atom-restarts-${process.pid}`),
}: {
	env?: Record<string, string | undefined>;
	now?: () => Date;
	restartsFile?: string;
} = {}): { recordRestarts(params: { restarts: number }): void } => {
	env[ATOM_BOOTED_AT] = now().toISOString();
	env[ATOM_RESTARTS_FILE] = restartsFile;
	writeFileSync(restartsFile, "0");
	return {
		recordRestarts: ({ restarts }) =>
			writeFileSync(restartsFile, String(restarts)),
	};
};

/** A process with no supervisor booted when it started and has never been respawned. */
export const createAtomHealthReader = ({
	env = process.env,
	clock = () => performance.now(),
	processStartedAt = new Date(Date.now() - performance.now()).toISOString(),
}: {
	env?: Record<string, string | undefined>;
	clock?: () => number;
	processStartedAt?: string;
} = {}): (() => AtomHealth) => {
	const bootedAt = env[ATOM_BOOTED_AT] ?? processStartedAt;
	const restartsFile = env[ATOM_RESTARTS_FILE];
	let restarts = 0;
	let readAt = Number.NEGATIVE_INFINITY;

	const readRestarts = (): number => {
		if (!restartsFile) return 0;
		if (clock() - readAt < RESTARTS_READ_EVERY_MS) return restarts;
		readAt = clock();
		try {
			restarts = Number(readFileSync(restartsFile, "utf8")) || 0;
		} catch {
			// The supervisor writes it before any child starts; a miss keeps the last count.
		}
		return restarts;
	};

	return () => ({ status: "alive", bootedAt, restarts: readRestarts() });
};
