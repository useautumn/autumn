import { availableParallelism, totalmem } from "node:os";
import { positiveInteger } from "./balanceWorker/primitives.js";

const LOCAL_ATOM_PORT = 8790;
const LOCAL_ATOM_PEER_PORT = 8791;
const AUTUMN_API_URL = "https://api.useautumn.com";
const SLOT_COUNT = 128;
const MAX_THREADS = 5;
const MiB = 1024 * 1024;
const MAIN_THREAD_BYTES = 256 * MiB;
const SERVING_THREAD_BYTES = 160 * MiB;
export const SQLITE_PAGE_CACHE_BYTES = 256 * 1024;
const PAGE_CACHE_PER_THREAD_BYTES = SLOT_COUNT * SQLITE_PAGE_CACHE_BYTES;
const HELD_SHARE = 0.5;
const HELD_EXPANSION = 5;
const HEALTH_LOG_EVERY_MS = 10_000;
const healthLogEveryMs = positiveInteger.min(1_000).max(2 ** 31 - 1);
const RECEIVER_SHARE_OF_THREADS = 0.3;

type AtomMachine = {
	availableCpus: number;
	memoryLimitBytes: number;
};

const readMachine = (): AtomMachine => {
	const constrainedMemory = process.constrainedMemory?.() ?? 0;
	return {
		availableCpus: availableParallelism(),
		memoryLimitBytes: constrainedMemory || totalmem(),
	};
};

const MAIN_BYTES = MAIN_THREAD_BYTES + PAGE_CACHE_PER_THREAD_BYTES;
const PER_THREAD_BYTES = SERVING_THREAD_BYTES + PAGE_CACHE_PER_THREAD_BYTES;

const threadsMemoryAllows = ({
	memoryLimitBytes,
}: {
	memoryLimitBytes: number;
}): number =>
	Math.floor((memoryLimitBytes - MAIN_BYTES) / (2 * PER_THREAD_BYTES));

const heldBytesPerThreadOf = ({
	threads,
	memoryLimitBytes,
}: {
	threads: number;
	memoryLimitBytes: number;
}): number => {
	const left = memoryLimitBytes - MAIN_BYTES - threads * PER_THREAD_BYTES;
	return Math.max(
		0,
		Math.floor((left * HELD_SHARE) / threads / HELD_EXPANSION),
	);
};
const SHA256_HEX = /^[0-9a-f]{64}$/;

const sha256Hex = ({ name, value }: { name: string; value: string }) => {
	if (!SHA256_HEX.test(value))
		throw new Error(`${name} must be a SHA-256 hex digest`);
	return value;
};

type AtomModeEnv = {
	ATOM_MODE: "deployed" | "multi_tenant";
	ATOM_TOKEN_HASH: string;
	ATOM_PEER_SECRET: string;
	ATOM_PEERS_FILE: string | null;
};

const isLoopback = (hostname: string): boolean =>
	hostname.startsWith("127.") || hostname === "localhost" || hostname === "::1";

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
		MAX_THREADS,
	);
	return Math.max(1, allowed);
};

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

export function createAtomEnv(
	runtimeEnv: Record<string, string | undefined>,
	machine: AtomMachine = readMachine(),
) {
	const hostname = runtimeEnv.ATOM_HOSTNAME?.trim() || "127.0.0.1";
	const modeEnv = modeEnvOf({ runtimeEnv, hostname });
	const threads = threadsOf({ runtimeEnv, machine });
	const receivesPushes = Boolean(runtimeEnv.ALIEN_PUSHES_BINDING?.trim());
	return {
		ATOM_HOSTNAME: hostname,
		ATOM_PORT: positiveInteger.parse(runtimeEnv.ATOM_PORT ?? LOCAL_ATOM_PORT),
		ATOM_PEER_PORT: positiveInteger.parse(
			runtimeEnv.ATOM_PEER_PORT ?? LOCAL_ATOM_PEER_PORT,
		),
		ATOM_DATA_DIR: runtimeEnv.ATOM_DATA_DIR?.trim() || ".data/atom",
		ATOM_AUTUMN_API_URL: runtimeEnv.AUTUMN_API_URL?.trim() || AUTUMN_API_URL,
		ATOM_SLOT_COUNT: positiveInteger.parse(
			runtimeEnv.ATOM_SLOT_COUNT ?? SLOT_COUNT,
		),
		ATOM_THREADS: threads,
		ATOM_PUSH_RECEIVERS: pushReceiversOf({
			runtimeEnv,
			threads,
			receivesPushes,
		}),
		ATOM_HELD_BYTES_PER_THREAD: heldBytesPerThreadOf({
			threads,
			memoryLimitBytes: machine.memoryLimitBytes,
		}),
		ATOM_HEALTH_LOG_EVERY_MS: healthLogEveryMs.parse(
			runtimeEnv.ATOM_HEALTH_LOG_EVERY_MS ?? HEALTH_LOG_EVERY_MS,
		),
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
