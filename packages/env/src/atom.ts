import { availableParallelism, totalmem } from "node:os";
import { positiveInteger } from "./balanceWorker/primitives.js";

const LOCAL_ATOM_PORT = 8790;
const AUTUMN_API_URL = "https://api.useautumn.com";
/** Fixed per org, so more or fewer cores never moves a customer to another file; a multi-tenant Atom splits each org the same way. */
const SLOT_COUNT = 128;
/** A container given no limits sees its whole host; past this many, more processes only cost memory. */
const MAX_AUTOMATIC_PROCESSES = 8;
/** Measured on Linux with 128 slots: a serving process, and the supervisor, each hold a little under this. */
const MEMORY_PER_PROCESS_BYTES = 250 * 1024 * 1024;
/** The rest is left for the OS, the files' page cache and a busy moment. */
const MEMORY_SHARE_FOR_PROCESSES = 0.75;
/** Checks far outnumber pushes, so most processes serve and the rest apply Autumn's pushes. */
const WRITER_SHARE_OF_PROCESSES = 0.3;

/** What the machine allows this process: the container's limits where it has them, not the host's totals. */
type AtomMachine = { availableCpus: number; memoryLimitBytes: number };

const readMachine = (): AtomMachine => ({
	availableCpus: availableParallelism(),
	// Zero or absent means no limit was set, so the machine's own memory is the limit.
	memoryLimitBytes: process.constrainedMemory?.() || totalmem(),
});

/** How many serving processes fit in memory, with one more counted for the supervisor that starts them. */
const processesMemoryAllows = ({
	memoryLimitBytes,
}: {
	memoryLimitBytes: number;
}): number => {
	const budget = memoryLimitBytes * MEMORY_SHARE_FOR_PROCESSES;
	return Math.floor(budget / MEMORY_PER_PROCESS_BYTES) - 1;
};
const SHA256_HEX = /^[0-9a-f]{64}$/;

const sha256Hex = ({ name, value }: { name: string; value: string }) => {
	if (!SHA256_HEX.test(value))
		throw new Error(`${name} must be a SHA-256 hex digest`);
	return value;
};

/** One token opens the Atom: an org's own when ATOM_MODE is unset; with multi_tenant, the admin token that opens `atoms.*`. */
type AtomModeEnv = {
	ATOM_MODE: "deployed" | "multi_tenant";
	ATOM_TOKEN_HASH: string;
};

/** Unset is the customer's single-tenant Atom; only our shadow Atom sets ATOM_MODE, to multi_tenant. */
const modeEnvOf = ({
	runtimeEnv,
}: {
	runtimeEnv: Record<string, string | undefined>;
}): AtomModeEnv => {
	const mode = runtimeEnv.ATOM_MODE?.trim() || null;
	if (mode !== null && mode !== "multi_tenant")
		throw new Error("ATOM_MODE is either unset or multi_tenant");
	const tokenHash = runtimeEnv.ATOM_TOKEN_HASH?.trim();
	if (!tokenHash) throw new Error("Set ATOM_TOKEN_HASH");
	return {
		ATOM_MODE: mode ?? "deployed",
		ATOM_TOKEN_HASH: sha256Hex({ name: "ATOM_TOKEN_HASH", value: tokenHash }),
	};
};

/** As many processes as both the CPUs and the memory allow, so a bigger machine is used without a setting to keep in step.
 * A multi-tenant Atom sizes the same way: each process re-reads the org folders, so any of them answers any org. */
const processesOf = ({
	runtimeEnv,
	machine,
}: {
	runtimeEnv: Record<string, string | undefined>;
	machine: AtomMachine;
}): number => {
	const told = runtimeEnv.ATOM_PROCESSES;
	if (told) return positiveInteger.parse(told);
	const allowed = Math.min(
		machine.availableCpus,
		processesMemoryAllows({ memoryLimitBytes: machine.memoryLimitBytes }),
		MAX_AUTOMATIC_PROCESSES,
	);
	return Math.max(1, allowed);
};

/** One process both serves and receives; past that, at least one of each, about a third writing. */
const writersOf = ({
	processes,
	receivesPushes,
}: {
	processes: number;
	receivesPushes: boolean;
}): number => {
	if (!receivesPushes) return 0;
	if (processes === 1) return 1;
	const share = Math.round(processes * WRITER_SHARE_OF_PROCESSES);
	return Math.min(Math.max(share, 1), processes - 1);
};

/** What Atom reads: where it listens, its data directory, the Autumn API it forwards to, and which tokens it answers to. */
export function createAtomEnv(
	runtimeEnv: Record<string, string | undefined>,
	machine: AtomMachine = readMachine(),
) {
	const hostname = runtimeEnv.ATOM_HOSTNAME?.trim() || "127.0.0.1";
	const modeEnv = modeEnvOf({ runtimeEnv });
	const processes = processesOf({ runtimeEnv, machine });
	// alien sets this where the `pushes` queue is linked; a multi-tenant Atom gets each org's pushes over HTTP instead.
	const receivesPushes =
		modeEnv.ATOM_MODE === "deployed" &&
		Boolean(runtimeEnv.ALIEN_PUSHES_BINDING?.trim());
	return {
		ATOM_HOSTNAME: hostname,
		ATOM_PORT: positiveInteger.parse(runtimeEnv.ATOM_PORT ?? LOCAL_ATOM_PORT),
		ATOM_DATA_DIR: runtimeEnv.ATOM_DATA_DIR?.trim() || ".data/atom",
		/** Where a request Atom does not answer itself is sent. */
		ATOM_AUTUMN_API_URL: runtimeEnv.AUTUMN_API_URL?.trim() || AUTUMN_API_URL,
		/** How many SQLite files an org's customers are split over. Changing it empties them: Autumn sends the customers again. */
		ATOM_SLOT_COUNT: positiveInteger.parse(
			runtimeEnv.ATOM_SLOT_COUNT ?? SLOT_COUNT,
		),
		/** How many processes run: those that serve checks share the port. */
		ATOM_PROCESSES: processes,
		/** How many of them read Autumn's pushes from the org's queue; 0 where no queue is linked. */
		ATOM_WRITERS: writersOf({ processes, receivesPushes }),
		...modeEnv,
	};
}

export type AtomEnv = ReturnType<typeof createAtomEnv>;
let atomEnv: AtomEnv | undefined;

export function getAtomEnv(): AtomEnv {
	atomEnv ??= createAtomEnv(process.env);
	return atomEnv;
}
