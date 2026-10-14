import { openSync } from "node:fs";
import { join } from "node:path";
import { timeout } from "@tests/utils/genUtils.js";
import type {
	Replica,
	ReplicaHealth,
	ReplicaSetContext,
} from "./types/replicaSet.js";

const ATOM_APP_DIR = join(import.meta.dir, "../../../../../../apps/atom");
export const REPLICA_PORT = 18790;
const REPLICA_PEER_PORT = 18791;
const REPLICA_THREADS = 2;
const READY_TIMEOUT_MS = 60_000;
const STOP_TIMEOUT_MS = 20_000;

export const replicaUrl = ({ replica }: { replica: Replica }): string =>
	`http://${replica.hostname}:${REPLICA_PORT}`;

const replicaEnv = ({
	ctx,
	replica,
}: {
	ctx: ReplicaSetContext;
	replica: Replica;
}): Record<string, string> => ({
	PATH: process.env.PATH ?? "",
	HOME: process.env.HOME ?? "",
	ATOM_HOSTNAME: replica.hostname,
	ATOM_PORT: String(REPLICA_PORT),
	ATOM_PEER_PORT: String(REPLICA_PEER_PORT),
	ATOM_DATA_DIR: replica.dataDir,
	ATOM_PEERS_FILE: replica.peersFile,
	ATOM_THREADS: String(REPLICA_THREADS),
	ATOM_TOKEN_HASH: ctx.tokenHash,
	ATOM_PEER_SECRET: ctx.peerSecret,
	AUTUMN_API_URL: ctx.autumnApiUrl,
});

export const spawnReplica = ({
	ctx,
	replica,
}: {
	ctx: ReplicaSetContext;
	replica: Replica;
}): void => {
	const log = openSync(replica.logFile, "a");
	replica.process = Bun.spawn(
		[process.execPath, "--config=./bunfig.toml", "src/main.ts"],
		{
			cwd: ATOM_APP_DIR,
			env: replicaEnv({ ctx, replica }),
			stdout: log,
			stderr: log,
		},
	);
};

export const replicaHealth = async ({
	replica,
}: {
	replica: Replica;
}): Promise<ReplicaHealth> => {
	try {
		const response = await fetch(`${replicaUrl({ replica })}/health`);
		return response.status === 200 ? "ready" : "starting";
	} catch {
		return "down";
	}
};

export const waitUntilReplicaReady = async ({
	replica,
}: {
	replica: Replica;
}): Promise<void> => {
	const deadline = Date.now() + READY_TIMEOUT_MS;
	while (Date.now() < deadline) {
		if (replica.process?.exitCode != null)
			throw new Error(
				`Replica ${replica.index} exited with ${replica.process.exitCode}; see ${replica.logFile}`,
			);
		if ((await replicaHealth({ replica })) === "ready") return;
		await timeout(50);
	}
	throw new Error(
		`Replica ${replica.index} was not ready within ${READY_TIMEOUT_MS} ms; see ${replica.logFile}`,
	);
};

export const signalReplica = async ({
	replica,
	signal,
}: {
	replica: Replica;
	signal: "SIGTERM" | "SIGKILL";
}): Promise<void> => {
	const running = replica.process;
	if (!running) return;
	replica.stopping = true;
	running.kill(signal);
	const stopped = await Promise.race([
		running.exited.then(() => true),
		timeout(STOP_TIMEOUT_MS).then(() => false),
	]);
	if (!stopped) {
		running.kill("SIGKILL");
		await running.exited;
	}
	replica.process = null;
	replica.stopping = false;
};
