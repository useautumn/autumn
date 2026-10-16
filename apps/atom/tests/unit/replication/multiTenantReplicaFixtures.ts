import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { hashToken } from "../../../src/auth/hashToken.js";
import { createAtomApp } from "../../../src/http/createAtomApp.js";
import { createPeerApp } from "../../../src/http/createPeerApp.js";
import { createMultiTenantAuth } from "../../../src/multiTenant/createMultiTenantAuth.js";
import {
	ATOM_DELETE,
	ATOM_PUT,
} from "../../../src/multiTenant/replicateAtoms.js";
import {
	CATALOG_PUSH,
	DELETE_PUSH,
	SUBJECT_PUSH,
} from "../../../src/pushes/applyPushes.js";
import { createReplicaRing } from "../../../src/replicas/createReplicaRing.js";
import { createReplicaSync } from "../../../src/replication/createReplicaSync.js";
import { createReplication } from "../../../src/replication/createReplication.js";
import { createMultiTenantFolders } from "../../../src/replication/folders/createReplicaFolders.js";
import { createHandlerRegistry } from "../../../src/replication/handlers/createHandlerRegistry.js";
import {
	createKeyRelay,
	KEYS_RELAY,
} from "../../../src/replication/keys/createKeyRelay.js";
import {
	createThreadStatsBuffer,
	openThreadCounters,
} from "../../../src/threads/stats/threadStats.js";
import {
	allSlotsOwnedHere,
	forwardingNowhere,
	freshHeld,
	loopOnTime,
	noSubjectPulls,
} from "../utils/atomFixtures.js";
import {
	AUTUMN_API_URL,
	PEER_PORT,
	PEER_SECRET,
	quiet,
	SLOT_COUNT,
} from "./replicaFixtures.js";

export const ADMIN_TOKEN = "atom_admin_token_1";
export const ADMIN_TOKEN_HASH = hashToken({ token: ADMIN_TOKEN });
/** Two tenants an admin registers, each with its own token. */
export const TENANT_TOKENS: Record<string, string> = {
	org_a: "atom_token_org_a",
	org_b: "atom_token_org_b",
};

const registry = createHandlerRegistry();
registry.register(SUBJECT_PUSH);
registry.register(DELETE_PUSH);
registry.register(CATALOG_PUSH);
registry.register(ATOM_PUT);
registry.register(ATOM_DELETE);
registry.register(KEYS_RELAY);

const cleanups: (() => void)[] = [];
export const cleanUpMultiTenantReplicas = () => {
	for (const cleanup of cleanups.splice(0)) cleanup();
};

/** One replica of our multi-tenant Atom: a folder per tenant the admin puts, with the same apps and replication as an org's own. */
export const createMultiTenantReplica = ({
	address,
	peers,
	ready = true,
	dataDir = mkdtempSync(join(tmpdir(), "atom-mt-replica-")),
	now = () => 1_000_000,
}: {
	address: string;
	peers: string[];
	ready?: boolean;
	dataDir?: string;
	now?: () => number;
}) => {
	const threadStats = createThreadStatsBuffer({ threads: 1 });
	const counters = openThreadCounters({ buffer: threadStats, index: 0 });
	const replication = createReplication({
		ctx: {
			secret: PEER_SECRET,
			port: PEER_PORT,
			registry,
			counters,
			logger: quiet,
			resolver: { peers: async () => peers, forget: () => {} },
			now,
			// Retries yield rather than spin: a relay the peer refuses is tried again until the test ends.
			sleep: () => Bun.sleep(1),
		},
	});
	const auth = createMultiTenantAuth({
		journalForwarder: forwardingNowhere,
		dataDir,
		slotCount: SLOT_COUNT,
		owners: allSlotsOwnedHere,
		heldSubjects: freshHeld(),
		subjectPulls: noSubjectPulls,
		keyRelay: createKeyRelay({ ctx: { replication } }),
	});
	const httpContext = {
		auth,
		multiTenant: { auth, adminTokenHash: ADMIN_TOKEN_HASH },
		logger: quiet,
		autumnApiUrl: AUTUMN_API_URL,
		health: {
			bootedAt: "2026-10-12T00:00:00.000Z",
			restarts: new Int32Array(1),
			ready: new Int32Array([ready ? 1 : 0]),
			threadsReady: new Int32Array([1]),
			thread: 0,
			threadStats,
			dataDir: dataDir,
		},
		counters,
		loop: loopOnTime,
		replication,
		// No peers in its ring: a multi-tenant replica answers every check itself here.
		peer: {
			port: PEER_PORT,
			secret: PEER_SECRET,
			ring: createReplicaRing({
				ctx: { resolver: { peers: async () => [] }, own: () => [address] },
			}),
		},
		now,
	};
	const app = createAtomApp({ ctx: httpContext });
	const peerApp = createPeerApp({ ctx: httpContext, secret: PEER_SECRET });
	cleanups.push(() => {
		void replication.stop();
		auth.close();
	});
	return {
		address,
		app,
		peerApp,
		auth,
		replication,
		dataDir,
		/** As the thread boots: every tenant's folder, and the ones a peer holds that this replica does not yet. */
		sync: () =>
			createReplicaSync({
				ctx: {
					replication,
					port: PEER_PORT,
					secret: PEER_SECRET,
					logger: quiet,
					sleep: async () => {},
					now,
					isStopping: () => false,
				},
				folders: createMultiTenantFolders({ auth }),
			}),
		close: () => auth.close(),
	};
};

export type MultiTenantReplica = ReturnType<typeof createMultiTenantReplica>;

export const putTenant = ({
	replica,
	id,
}: {
	replica: MultiTenantReplica;
	id: string;
}) =>
	replica.app.request("/v1/atoms.put", {
		method: "POST",
		headers: {
			"content-type": "application/json",
			"x-atom-admin-token": ADMIN_TOKEN,
		},
		body: JSON.stringify({
			id,
			token_hash: hashToken({ token: TENANT_TOKENS[id] ?? "" }),
		}),
	});

export const deleteTenant = ({
	replica,
	id,
}: {
	replica: MultiTenantReplica;
	id: string;
}) =>
	replica.app.request("/v1/atoms.delete", {
		method: "POST",
		headers: {
			"content-type": "application/json",
			"x-atom-admin-token": ADMIN_TOKEN,
		},
		body: JSON.stringify({ id }),
	});

/** The customers a replica holds for one tenant, by its own folder. */
export const heldFor = async ({
	replica,
	id,
}: {
	replica: MultiTenantReplica;
	id: string;
}): Promise<string[]> => {
	const slots = replica.auth.slotsFor({ atomId: id });
	if (!slots) return [];
	const pages = await Promise.all(
		Array.from({ length: SLOT_COUNT }, (_, slot) =>
			slots.listSince({ slot, after: null, cursor: null, limit: 1_000 }),
		),
	);
	return pages.flat().map(({ subject }) => subject.state.identity.customerId);
};
