import { availableParallelism, totalmem } from "node:os";
import { positiveInteger } from "./balanceWorker/primitives.js";

const LOCAL_ATOM_PORT = 8790;
const AUTUMN_API_URL = "https://api.useautumn.com";
/** Fixed per org, so more or fewer cores never moves a customer to another file; a multi-tenant Atom splits each org the same way. */
const SLOT_COUNT = 128;
/** A container given no limits sees its whole host; past this many, more threads only cost memory. */
const MAX_AUTOMATIC_THREADS = 8;
/** Measured on Linux with 128 slots: a serving thread, and the main thread, each hold a little under this. */
const MEMORY_PER_THREAD_BYTES = 250 * 1024 * 1024;
/** The rest is left for the OS, the files' page cache and a busy moment. */
const MEMORY_SHARE_FOR_THREADS = 0.75;
/** Checks far outnumber pushes, so a share of the threads also receive Autumn's pushes. */
const RECEIVER_SHARE_OF_THREADS = 0.3;

/** What the machine allows the Atom: the container's limits where it has them, not the host's totals. */
type AtomMachine = { availableCpus: number; memoryLimitBytes: number };

const readMachine = (): AtomMachine => ({
	availableCpus: availableParallelism(),
	// Zero or absent means no limit was set, so the machine's own memory is the limit.
	memoryLimitBytes: process.constrainedMemory?.() || totalmem(),
});

/** How many serving threads fit in memory, with one more counted for the main thread that starts them. */
const threadsMemoryAllows = ({
	memoryLimitBytes,
}: {
	memoryLimitBytes: number;
}): number => {
	const budget = memoryLimitBytes * MEMORY_SHARE_FOR_THREADS;
	return Math.floor(budget / MEMORY_PER_THREAD_BYTES) - 1;
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

/** The SDK reads the linked queue unless ATOM_PUSH_QUEUE_CLIENT=binding falls back to the Alien binding's own client. */
const sdkPushQueueUrlOf = ({
	runtimeEnv,
}: {
	runtimeEnv: Record<string, string | undefined>;
}): string | null => {
	const client = runtimeEnv.ATOM_PUSH_QUEUE_CLIENT?.trim() || "sdk";
	if (client !== "sdk" && client !== "binding")
		throw new Error("ATOM_PUSH_QUEUE_CLIENT is either sdk or binding");
	const binding = runtimeEnv.ALIEN_PUSHES_BINDING?.trim();
	if (client === "binding" || !binding) return null;
	const queueUrl = JSON.parse(binding).queueUrl;
	if (typeof queueUrl !== "string")
		throw new Error(
			"ALIEN_PUSHES_BINDING names no queueUrl for the SDK to read",
		);
	return queueUrl;
};

/** As many threads as both the CPUs and the memory allow, so a bigger machine is used without a setting to keep in step.
 * A multi-tenant Atom sizes the same way: each thread re-reads the org folders, so any of them answers any org. */
const threadsOf = ({
	runtimeEnv,
	machine,
}: {
	runtimeEnv: Record<string, string | undefined>;
	machine: AtomMachine;
}): number => {
	const told = runtimeEnv.ATOM_THREADS;
	if (told) return positiveInteger.parse(told);
	const allowed = Math.min(
		machine.availableCpus,
		threadsMemoryAllows({ memoryLimitBytes: machine.memoryLimitBytes }),
		MAX_AUTOMATIC_THREADS,
	);
	return Math.max(1, allowed);
};

/** ATOM_PUSH_RECEIVERS when set; otherwise one thread both serves and receives, and past that about a third also receive. */
const pushReceiversOf = ({
	runtimeEnv,
	threads,
	receivesPushes,
}: {
	runtimeEnv: Record<string, string | undefined>;
	threads: number;
	receivesPushes: boolean;
}): number => {
	if (!receivesPushes) return 0;
	const told = runtimeEnv.ATOM_PUSH_RECEIVERS;
	if (told) return Math.min(positiveInteger.parse(told), threads);
	if (threads === 1) return 1;
	const share = Math.round(threads * RECEIVER_SHARE_OF_THREADS);
	return Math.min(Math.max(share, 1), threads - 1);
};

/** What Atom reads: where it listens, its data directory, the Autumn API it forwards to, and which tokens it answers to. */
export function createAtomEnv(
	runtimeEnv: Record<string, string | undefined>,
	machine: AtomMachine = readMachine(),
) {
	const hostname = runtimeEnv.ATOM_HOSTNAME?.trim() || "127.0.0.1";
	const modeEnv = modeEnvOf({ runtimeEnv });
	const threads = threadsOf({ runtimeEnv, machine });
	// alien sets this where the `pushes` queue is linked; a multi-tenant Atom's pushes name the org's folder.
	const receivesPushes = Boolean(runtimeEnv.ALIEN_PUSHES_BINDING?.trim());
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
		/** How many threads serve checks on the shared port, each owning its share of the slots. */
		ATOM_THREADS: threads,
		/** How many of them also read Autumn's pushes from the org's queue; 0 where no queue is linked. */
		ATOM_PUSH_RECEIVERS: pushReceiversOf({
			runtimeEnv,
			threads,
			receivesPushes,
		}),
		/** The pushes queue the AWS SDK reads; null where the binding reads it or no queue is linked. */
		ATOM_SDK_PUSH_QUEUE_URL: sdkPushQueueUrlOf({ runtimeEnv }),
		...modeEnv,
	};
}

export type AtomEnv = ReturnType<typeof createAtomEnv>;
let atomEnv: AtomEnv | undefined;

export function getAtomEnv(): AtomEnv {
	atomEnv ??= createAtomEnv(process.env);
	return atomEnv;
}
