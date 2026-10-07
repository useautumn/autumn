import { Bindings } from "@alienplatform/bindings";
import { createAesCipher } from "@autumn/encryption";
import { getCacheEnv } from "@autumn/env/cache";
import { getHeraldEnv } from "@autumn/env/herald";
import { createAtomClient } from "../atom/createAtomClient.js";
import { createAtomPushQueue } from "../atom/queue/createAtomPushQueue.js";
import { createQueueAtomClient } from "../atom/queue/createQueueAtomClient.js";
import type { AtomPushQueue } from "../atom/queue/types/atomPushQueue.js";
import type {
	AtomClient,
	AtomConnection,
	AtomDelivery,
	GetAtomClient,
} from "../atom/types/atomClient.js";
import { getHeraldLogger } from "./getHeraldLogger.js";

/** A subject is sent once: an Atom sits in the org's own cloud, and the customer's next change corrects a miss. */
const SUBJECT_DELIVERY: AtomDelivery = { timeoutMs: 2_000, retry: null };

/** The catalog is rare and every customer reads it, so it gets three tries: at most ~35s, waits included. */
const CATALOG_DELIVERY: AtomDelivery = {
	timeoutMs: 10_000,
	retry: { attempts: 3, baseDelayMs: 500, maxDelayMs: 5_000 },
};

/** The queue `packages/alien/stacks/byoc/alien.json` opens to Autumn. */
const PUSH_QUEUE = "pushes";

const unreadableToken = (): string => {
	throw new Error(
		"ENCRYPTION_PASSWORD is not set; an Atom's token cannot be read",
	);
};

/** Opens the token the server encrypted onto the org's record. */
function decryptOf(): (encrypted: string) => string {
	const password = getCacheEnv().CACHE_ENCRYPTION_PASSWORD;
	return password ? createAesCipher({ password }).decrypt : unreadableToken;
}

let decrypt: ((encrypted: string) => string) | undefined;
const atomClients = new Map<string, AtomClient>();
const pushQueues = new Map<string, AtomPushQueue>();

/** One queue per alien deployment group, shared by every org's folder on it. */
const getAtomPushQueue = ({
	externalId,
}: {
	externalId: string;
}): AtomPushQueue => {
	const held = pushQueues.get(externalId);
	if (held) return held;
	const alien = getHeraldEnv().HERALD_ALIEN;
	if (!alien)
		throw new Error(
			"ALIEN_API_KEY and ALIEN_PROJECT are not set; an Atom's queue cannot be reached",
		);
	const pushQueue = createAtomPushQueue({
		openQueue: async () =>
			(
				await Bindings.forRemoteCustomer({
					project: alien.project,
					externalId,
					token: alien.apiKey,
				})
			).queue(PUSH_QUEUE),
	});
	pushQueues.set(externalId, pushQueue);
	return pushQueue;
};

const createConnectionClient = ({
	connection,
}: {
	connection: AtomConnection;
}): AtomClient => {
	decrypt ??= decryptOf();
	const http = createAtomClient({
		connection,
		config: { decrypt, subjects: SUBJECT_DELIVERY, catalog: CATALOG_DELIVERY },
	});
	if (!connection.queue) return http;
	return createQueueAtomClient({
		ctx: {
			pushQueue: getAtomPushQueue({ externalId: connection.queue.externalId }),
			http,
			logger: getHeraldLogger(),
		},
		atomId: connection.queue.atomId,
	});
};

/** One client per org's Atom and transport, made on its first push. A re-created Atom has a new token, so a new client. */
export const getAtomClient: GetAtomClient = ({ connection }) => {
	// Deliberate: Atoms run on dev stacks and staging only for now, so production has no HTTP push path to keep.
	if (!getHeraldEnv().HERALD_ATOM_HTTP_PUSH)
		throw new Error(
			"Atom pushes run on dev stacks and staging only; production has none yet",
		);
	const key = [
		connection.endpointUrl,
		connection.encryptedToken,
		connection.queue?.externalId,
		connection.queue?.atomId,
	].join(" ");
	const held = atomClients.get(key);
	if (held) return held;

	const atomClient = createConnectionClient({ connection });
	atomClients.set(key, atomClient);
	return atomClient;
};
