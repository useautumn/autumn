import { availableParallelism, totalmem } from "node:os";
import { positiveInteger } from "./balanceWorker/primitives.js";

const LOCAL_ATOM_PORT = 8790;
/** Where the replicas of an org's Atom listen to each other; the stack lists it as a container port but never a public endpoint. */
const LOCAL_ATOM_PEER_PORT = 8791;
const AUTUMN_API_URL = "https://api.useautumn.com";
/** Fixed per org, so more or fewer cores never moves a customer to another file; a multi-tenant Atom splits each org the same way. */
const SLOT_COUNT = 128;
/** Only for a container given no limits, which sees its whole host; past this many, more threads only cost memory. */
const MAX_UNLIMITED_THREADS = 8;
/** Measured on Linux with 128 slots: a serving thread, and the main thread, each hold a little under this. */
const MEMORY_PER_THREAD_BYTES = 250 * 1024 * 1024;
/** The rest is left for the OS, the files' page cache and a busy moment. */
const MEMORY_SHARE_FOR_THREADS = 0.75;
/** A held subject's parsed, frozen objects take about this many times the bytes of its row text; conservative until measured on a live Atom. */
const HELD_EXPANSION = 3;
const HEALTH_LOG_EVERY_MS = 10_000;
/** A timer past a signed 32-bit delay fires every millisecond instead; a second is the shortest worth a line. */
const healthLogEveryMs = positiveInteger.min(1_000).max(2 ** 31 - 1);
/** Checks far outnumber pushes, so a share of the threads also receive Autumn's pushes. */
const RECEIVER_SHARE_OF_THREADS = 0.3;

/** What the machine allows the Atom: the container's limits where it has them, not the host's totals. */
type AtomMachine = {
	availableCpus: number;
	memoryLimitBytes: number;
	isContainerLimited: boolean;
};

const readMachine = (): AtomMachine => {
	// Zero or absent means no limit was set, so the machine's own memory is the limit.
	const constrainedMemory = process.constrainedMemory?.() ?? 0;
	return {
		availableCpus: availableParallelism(),
		memoryLimitBytes: constrainedMemory || totalmem(),
		isContainerLimited: constrainedMemory > 0,
	};
};

/** How many serving threads fit in memory, with one more counted for the main thread that starts them. */
const threadsMemoryAllows = ({
	memoryLimitBytes,
}: {
	memoryLimitBytes: number;
}): number => {
	const budget = memoryLimitBytes * MEMORY_SHARE_FOR_THREADS;
	return Math.floor(budget / MEMORY_PER_THREAD_BYTES) - 1;
};
/** Row text each thread may hold parsed: the threads' memory share, less each thread's own, split between them and shrunk by the expansion. */
const heldBytesPerThreadOf = ({
	threads,
	memoryLimitBytes,
}: {
	threads: number;
	memoryLimitBytes: number;
}): number => {
	const forHeld =
		memoryLimitBytes * MEMORY_SHARE_FOR_THREADS -
		(threads + 1) * MEMORY_PER_THREAD_BYTES;
	return Math.max(0, Math.floor(forHeld / threads / HELD_EXPANSION));
};
const SHA256_HEX = /^[0-9a-f]{64}$/;

const sha256Hex = ({ name, value }: { name: string; value: string }) => {
	if (!SHA256_HEX.test(value))
		throw new Error(`${name} must be a SHA-256 hex digest`);
	return value;
};

/**
 * One token opens the Atom: an org's own when ATOM_MODE is unset; with multi_tenant, the admin token that opens `atoms.*`.
 * Either way its replicas sign what they send each other with the deployment's own secret.
 */
type AtomModeEnv = {
	ATOM_MODE: "deployed" | "multi_tenant";
	ATOM_TOKEN_HASH: string;
	ATOM_PEER_SECRET: string;
	ATOM_PEERS_FILE: string | null;
};

const isLoopback = (hostname: string): boolean =>
	hostname.startsWith("127.") || hostname === "localhost" || hostname === "::1";

/** A replica set on one machine has no atom.svc to resolve, so its harness lists each replica's peers in a file.
 * Only a replica listening on a loopback address reads one, so a deployed Atom (0.0.0.0) never does. */
const peersFileOf = ({
	runtimeEnv,
	hostname,
}: {
	runtimeEnv: Record<string, string | undefined>;
	hostname: string;
}): string | null => {
	const peersFile = runtimeEnv.ATOM_PEERS_FILE?.trim();
	if (!peersFile) return null;
	if (!isLoopback(hostname))
		throw new Error(
			"ATOM_PEERS_FILE is for a replica set on one machine: set it only with a loopback ATOM_HOSTNAME",
		);
	return peersFile;
};

/** Unset is the customer's single-tenant Atom; only our shadow Atom sets ATOM_MODE, to multi_tenant. */
const modeEnvOf = ({
	runtimeEnv,
	hostname,
}: {
	runtimeEnv: Record<string, string | undefined>;
	hostname: string;
}): AtomModeEnv => {
	const mode = runtimeEnv.ATOM_MODE?.trim() || null;
	if (mode !== null && mode !== "multi_tenant")
		throw new Error("ATOM_MODE is either unset or multi_tenant");
	const tokenHash = runtimeEnv.ATOM_TOKEN_HASH?.trim();
	if (!tokenHash) throw new Error("Set ATOM_TOKEN_HASH");
	const ATOM_TOKEN_HASH = sha256Hex({
		name: "ATOM_TOKEN_HASH",
		value: tokenHash,
	});
	const peerSecret = runtimeEnv.ATOM_PEER_SECRET?.trim();
	if (!peerSecret)
		throw new Error(
			"Set ATOM_PEER_SECRET: an Atom's replicas sign what they send each other with it, and the stack generates one per deployment",
		);
	return {
		ATOM_MODE: mode ?? "deployed",
		ATOM_TOKEN_HASH,
		ATOM_PEER_SECRET: peerSecret,
		ATOM_PEERS_FILE: peersFileOf({ runtimeEnv, hostname }),
	};
};

/** Alien tags each queue binding with its service; only an SQS queue has a URL the AWS SDK can read. */
const sqsQueueUrlOf = ({ binding }: { binding: string }): string | null => {
	const { service, queueUrl } = JSON.parse(binding);
	if (service !== "sqs" || typeof queueUrl !== "string") return null;
	return queueUrl;
};

/** ATOM_PUSH_QUEUE_CLIENT=auto (the default) reads an SQS queue with the AWS SDK and any other with the Alien binding; binding or sdk forces one. */
const sdkPushQueueUrlOf = ({
	runtimeEnv,
}: {
	runtimeEnv: Record<string, string | undefined>;
}): string | null => {
	const client = runtimeEnv.ATOM_PUSH_QUEUE_CLIENT?.trim() || "auto";
	if (client !== "auto" && client !== "binding" && client !== "sdk")
		throw new Error("ATOM_PUSH_QUEUE_CLIENT is auto, binding or sdk");
	const binding = runtimeEnv.ALIEN_PUSHES_BINDING?.trim();
	if (client === "binding" || !binding) return null;
	const queueUrl = sqsQueueUrlOf({ binding });
	if (queueUrl || client === "auto") return queueUrl;
	throw new Error(
		"ALIEN_PUSHES_BINDING names no SQS queueUrl for the SDK to read",
	);
};

/** As many threads as both the container's CPUs and its memory allow, so a bigger size is used without a setting to keep in step.
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
		machine.isContainerLimited
			? Number.POSITIVE_INFINITY
			: MAX_UNLIMITED_THREADS,
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
	const modeEnv = modeEnvOf({ runtimeEnv, hostname });
	const threads = threadsOf({ runtimeEnv, machine });
	// alien sets this where the `pushes` queue is linked; a multi-tenant Atom's pushes name the org's folder.
	const receivesPushes = Boolean(runtimeEnv.ALIEN_PUSHES_BINDING?.trim());
	return {
		ATOM_HOSTNAME: hostname,
		ATOM_PORT: positiveInteger.parse(runtimeEnv.ATOM_PORT ?? LOCAL_ATOM_PORT),
		ATOM_PEER_PORT: positiveInteger.parse(
			runtimeEnv.ATOM_PEER_PORT ?? LOCAL_ATOM_PEER_PORT,
		),
		ATOM_DATA_DIR: runtimeEnv.ATOM_DATA_DIR?.trim() || ".data/atom",
		/** Where a request Atom does not answer itself is sent. */
		ATOM_AUTUMN_API_URL: runtimeEnv.AUTUMN_API_URL?.trim() || AUTUMN_API_URL,
		/** How many SQLite files an org's customers are split over. Changing it empties them: Autumn sends the customers again. */
		ATOM_SLOT_COUNT: positiveInteger.parse(
			runtimeEnv.ATOM_SLOT_COUNT ?? SLOT_COUNT,
		),
		/** How many threads serve checks on the shared port. */
		ATOM_THREADS: threads,
		/** How many of them also read Autumn's pushes from the org's queue; 0 where no queue is linked. */
		ATOM_PUSH_RECEIVERS: pushReceiversOf({
			runtimeEnv,
			threads,
			receivesPushes,
		}),
		/** Bytes of row text each thread keeps parsed before it drops its least recently read subjects. */
		ATOM_HELD_BYTES_PER_THREAD: heldBytesPerThreadOf({
			threads,
			memoryLimitBytes: machine.memoryLimitBytes,
		}),
		/** How often the main thread logs what /health reports. */
		ATOM_HEALTH_LOG_EVERY_MS: healthLogEveryMs.parse(
			runtimeEnv.ATOM_HEALTH_LOG_EVERY_MS ?? HEALTH_LOG_EVERY_MS,
		),
		/** The pushes queue's URL where the AWS SDK reads it; null where the binding reads it or no queue is linked. */
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
