import { spyOn } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseTrackCommand, type TrackCommand } from "@autumn/balance-engine";
import { createDeployedAuth } from "../../../src/auth/createDeployedAuth.js";
import { hashToken } from "../../../src/auth/hashToken.js";
import { createAtomApp } from "../../../src/http/createAtomApp.js";
import { createPeerApp } from "../../../src/http/createPeerApp.js";
import { createJournalForwarder } from "../../../src/journalForwarder/createJournalForwarder.js";
import {
	CATALOG_PUSH,
	DELETE_PUSH,
	SUBJECT_PUSH,
} from "../../../src/pushes/applyPushes.js";
import { createReplicaRing } from "../../../src/replicas/createReplicaRing.js";
import { leaveRing } from "../../../src/replicas/handover/leaveRing.js";
import { createMembership } from "../../../src/replicas/membership/createMembership.js";
import { createReplicaSync } from "../../../src/replication/createReplicaSync.js";
import { createReplication } from "../../../src/replication/createReplication.js";
import { createDeployedFolders } from "../../../src/replication/folders/createReplicaFolders.js";
import { createHandlerRegistry } from "../../../src/replication/handlers/createHandlerRegistry.js";
import { customerIdToSlot } from "../../../src/slots/customerIdToSlot.js";
import {
	createThreadStatsBuffer,
	openThreadCounters,
	readThreadStats,
} from "../../../src/threads/stats/threadStats.js";
import {
	allSlotsOwnedHere,
	forwardingNowhere,
	freshHeld,
	loopOnTime,
	noSubjectPulls,
	subjectBody,
} from "../utils/atomFixtures.js";

export const ATOM_TOKEN = "atom_token_1";
export const TOKEN_HASH = hashToken({ token: ATOM_TOKEN });
export const PEER_SECRET = "p".repeat(64);
export const PEER_PORT = 8002;
export const SLOT_COUNT = 2;
export const AUTUMN_API_URL = "https://api.autumn.example";
export const quiet = { info: () => {}, warn: () => {}, error: () => {} };

const registry = createHandlerRegistry();
registry.register(SUBJECT_PUSH);
registry.register(DELETE_PUSH);
registry.register(CATALOG_PUSH);

const cleanups: (() => void)[] = [];
export const cleanUpReplicas = () => {
	for (const cleanup of cleanups.splice(0)) cleanup();
};

/** One replica of an org's Atom: its own folder, public app, peer app and replication, with a clock a test can run. */
export const createReplica = ({
	address,
	peers,
	ready = true,
	dataDir = mkdtempSync(join(tmpdir(), "atom-replica-")),
	secret = PEER_SECRET,
	now = () => 1_000_000,
	ringPeers = [],
	journalForwarder = forwardingNowhere,
	stopping = () => false,
}: {
	address: string;
	peers: string[];
	ready?: boolean;
	dataDir?: string;
	secret?: string;
	now?: () => number;
	/** The peers this replica's ring counts as owners; none by default, so it answers every customer itself. */
	ringPeers?: string[];
	journalForwarder?: typeof forwardingNowhere;
	/** True from the moment the thread starts stopping, as its server's stop sets it. */
	stopping?: () => boolean;
}) => {
	const threadStats = createThreadStatsBuffer({ threads: 1 });
	const counters = openThreadCounters({ buffer: threadStats, index: 0 });
	const auth = createDeployedAuth({
		journalForwarder,
		dataDir,
		tokenHash: TOKEN_HASH,
		slotCount: SLOT_COUNT,
		owners: allSlotsOwnedHere,
		held: freshHeld(),
		now,
		subjectPulls: noSubjectPulls,
	});
	const replication = createReplication({
		ctx: {
			secret,
			port: PEER_PORT,
			registry,
			counters,
			logger: quiet,
			resolver: { peers: async () => peers, forget: () => {} },
			now,
			sleep: async () => {},
		},
	});
	const readyFlag = new Int32Array([ready ? 1 : 0]);
	const membership = createMembership({ self: address, now });
	const ring = createReplicaRing({
		ctx: {
			resolver: { peers: async () => ringPeers },
			own: () => [address],
			membership,
		},
	});
	const httpContext = {
		auth,
		logger: quiet,
		autumnApiUrl: AUTUMN_API_URL,
		health: {
			bootedAt: "2026-10-12T00:00:00.000Z",
			restarts: new Int32Array(1),
			ready: readyFlag,
			threadsReady: new Int32Array([1]),
			thread: 0,
			threadStats,
			dataDir: dataDir,
		},
		counters,
		loop: loopOnTime,
		replication,
		stopping,
		peer: { port: PEER_PORT, secret, ring, membership },
		now,
	};
	const app = createAtomApp({ ctx: httpContext });
	const peerApp = createPeerApp({ ctx: httpContext, secret });
	const syncContext = {
		replication,
		port: PEER_PORT,
		secret,
		logger: quiet,
		sleep: async () => {},
		now,
		isStopping: () => false,
	};
	cleanups.push(() => {
		void replication.stop();
		auth.close();
		rmSync(dataDir, { recursive: true, force: true });
	});
	return {
		address,
		app,
		peerApp,
		slots: auth.slots,
		replication,
		ring,
		membership,
		/** The first step of a planned stop: owner of nothing, and every peer told. */
		leave: () =>
			leaveRing({
				ctx: {
					ring,
					membership,
					peer: { port: PEER_PORT, secret },
					logger: quiet,
				},
			}),
		dataDir,
		stats: () => readThreadStats({ buffer: threadStats })[0],
		setReady: (value: boolean) => Atomics.store(readyFlag, 0, value ? 1 : 0),
		/** As the thread boots: the point it fell behind at is fixed here, before any live relay lands. */
		sync: () =>
			createReplicaSync({
				ctx: syncContext,
				folders: createDeployedFolders({ slots: auth.slots }),
			}),
		/** Closes the files, as a process that stops or dies does; the folder stays for a restart on the same volume. */
		close: () => auth.close(),
	};
};

export type Replica = ReturnType<typeof createReplica>;

/**
 * The deployment network plus, when given, the Autumn API: a request to a replica's address lands on its public
 * app or its peer app by port. Honours the caller's abort signal like a real fetch.
 */
/** What the network needs of a replica: where it is and the apps that answer on each port. */
export type Reachable = Pick<Replica, "address" | "app" | "peerApp">;

export const connect = ({
	replicas,
	autumn,
	replyFrom = async (_replica, reply) => reply,
}: {
	replicas: Reachable[];
	autumn?: (request: Request) => Promise<Response>;
	/** What the caller sees of a replica's reply: a test can lose it on the way back, as a dropped connection does. */
	replyFrom?: (replica: Reachable, reply: Response) => Promise<Response>;
}) => {
	const byAddress = new Map(
		replicas.map((replica) => [replica.address, replica]),
	);
	const dispatch = async (input: URL | RequestInfo, init?: RequestInit) => {
		const url = new URL(
			typeof input === "string" ? input : (input as Request).url,
		);
		if (url.origin === AUTUMN_API_URL && autumn)
			return autumn(new Request(url, init));
		const replica = byAddress.get(url.hostname);
		if (!replica)
			throw Object.assign(
				new TypeError(`connect ECONNREFUSED ${url.hostname}`),
				{ code: "ECONNREFUSED" },
			);
		const app = Number(url.port) === PEER_PORT ? replica.peerApp : replica.app;
		const reply = await app.request(`${url.pathname}${url.search}`, {
			...init,
			signal: undefined,
		});
		return replyFrom(replica, reply);
	};
	spyOn(globalThis, "fetch").mockImplementation(((
		input: URL | RequestInfo,
		init?: RequestInit,
	) => {
		const signal = init?.signal;
		if (!signal) return dispatch(input, init);
		return Promise.race([
			dispatch(input, init),
			new Promise<never>((_, reject) =>
				signal.addEventListener("abort", () => reject(signal.reason)),
			),
		]);
	}) as typeof fetch);
};

export const disconnect = () => spyOn(globalThis, "fetch").mockRestore();

/** Customer ids that all live in `slot`, so they share one slot file. */
export const customersInSlot = ({
	slot,
	count,
}: {
	slot: number;
	count: number;
}) => {
	const ids: string[] = [];
	for (let i = 0; ids.length < count; i++)
		if (
			customerIdToSlot({ customerId: `cus_${i}`, slotCount: SLOT_COUNT }) ===
			slot
		)
			ids.push(`cus_${i}`);
	return ids;
};

export const bodyFor = ({
	customerId,
	readAt,
	balance = 10,
}: {
	customerId: string;
	readAt: number;
	balance?: number;
}) => {
	const body = subjectBody({ balance });
	return JSON.stringify({
		...body,
		state: { ...body.state, identity: { ...body.state.identity, customerId } },
		read_at: readAt,
	});
};

/** Stores a push on one replica only, as when its relay never reached the others. */
export const storeOnly = ({
	replica,
	customerId,
	readAt,
	balance,
}: {
	replica: Replica;
	customerId: string;
	readAt: number;
	balance?: number;
}) =>
	replica.slots
		.processorFor({ customerId })
		.setSubject({ customerId, body: bodyFor({ customerId, readAt, balance }) });

export const heldIds = async ({
	replica,
	slot,
}: {
	replica: Replica;
	slot: number;
}) =>
	(
		await replica.slots.listSince({
			slot,
			after: null,
			cursor: null,
			limit: 100_000,
		})
	).map(({ subject }) => subject.state.identity.customerId);

export const heldEverywhere = async (replica: Replica) =>
	(
		await Promise.all(
			Array.from({ length: SLOT_COUNT }, (_, slot) =>
				heldIds({ replica, slot }),
			),
		)
	).flat();

export const settle = () => new Promise((resolve) => setTimeout(resolve, 30));

/** Autumn's side of the journal: every track the replicas journaled, under the writer id of the journal it came from. */
export const recordJournals = () => {
	const appended: {
		writer: string;
		/** Who claims the key at Autumn's worker: the same owner again resumes its claim, any other is a duplicate. */
		owner: string;
		key: string | undefined;
		value: number;
	}[] = [];
	const commands: TrackCommand[] = [];
	const forwarder = createJournalForwarder({
		ctx: {
			autumnClient: {
				appendTracks: async ({ tracks }) => {
					for (const track of tracks) {
						if (!("command" in track)) continue;
						const command = parseTrackCommand({ input: track.command });
						commands.push(command);
						appended.push({
							writer: track.writerId,
							owner: command.requestId,
							key: command.idempotency?.key,
							value: command.value,
						});
					}
				},
			},
			logger: quiet,
		},
	});
	return { forwarder, appended, commands };
};
