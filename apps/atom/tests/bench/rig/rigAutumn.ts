/**
 * Driver box: Autumn as the replicas see it. Each handed-in track is applied with the engine to its customer's own state
 * and the customer pushed to a random replica after a herald-like lag; settle pulls read the same state. Spawned by
 * rig:driver: `bun run rig:autumn <replicaUrl,...>`.
 */
import {
	applyMutation,
	computeAtomFinalize,
	computeTrack,
	findLockInsertInMutation,
	parseAtomFinalizeCommand,
	type SubjectState,
	subjectStateToFullSubject,
	type TrackCommand,
	type WorkerLock,
} from "@autumn/balance-engine";
import type { AtomFinalize } from "@autumn/byoc";
import {
	ATOM_CUSTOMER_ID_HEADER,
	ATOM_KEYS_PATH,
	ATOM_SUBJECT_READ_PATH,
	ATOM_TRACKS_APPEND_PATH,
	AtomPushType,
	AtomTracksAppendRequestSchema,
	atomPushMessageToPayload,
} from "@autumn/byoc";
import { rigConfig } from "./rigConfig.js";
import { createRigQueue } from "./rigQueue.js";
import { customerIdsOf, logNormalOf } from "./rigShared.js";
import { resendSubjectOf } from "./rigSubjects.js";

const replicaUrls = (process.argv[2] ?? "").split(",").filter(Boolean);
if (replicaUrls.length === 0)
	throw new Error("Usage: rig:autumn <replicaUrl,replicaUrl>");
const { tenant, stub } = rigConfig;
const queue = createRigQueue();

const template = resendSubjectOf({ customerId: "template" });
const states = new Map<string, SubjectState>();
let logOffset = 10n;
let readAt = 2_000;
const pushLag = logNormalOf({ p50: stub.pushLagP50Ms, p99: stub.pushLagP99Ms });
/** Autumn's balance_locks rows, by lock_id, with the track that took each: a finalize settles the row, as the worker does. */
const locks = new Map<string, { row: WorkerLock; track: TrackCommand }>();
/** Any handed-in track, for the org and feature ids a finalize of a lock Autumn never held is read with. */
let lastTrack: TrackCommand | null = null;
const counts = {
	tracks: 0,
	lockTracks: 0,
	finalizes: 0,
	finalizesWithoutRow: 0,
	appends: 0,
	pushes: 0,
	pushFailed: 0,
	pulls: 0,
	keyChecks: 0,
	forwarded: {} as Record<string, number>,
};

const stateOf = (customerId: string): SubjectState => {
	const held = states.get(customerId);
	if (held) return held;
	return {
		...template.state,
		identity: { ...template.state.identity, customerId },
	};
};

const fullSubjectOf = (state: SubjectState) =>
	subjectStateToFullSubject({ state, catalog: template.catalog });

const applyTrack = ({
	command,
	writerId,
	seq,
}: {
	command: TrackCommand;
	writerId: string;
	seq: number;
}) => {
	const customerId = command.identity.customerId;
	const state = stateOf(customerId);
	const mutation = computeTrack({
		fullSubject: fullSubjectOf(state),
		command: { ...command, source: { atomId: tenant.atomId, writerId, seq } },
	});
	states.set(customerId, applyMutation({ state, mutation }));
	lastTrack = command;
	const row = findLockInsertInMutation({ mutation });
	if (!row || !command.lock) return;
	counts.lockTracks++;
	locks.set(command.lock.lockId, { row, track: command });
};

/** As the server reads an Atom's finalize into the worker's atomFinalize, settled from Autumn's own row for the lock. */
const applyFinalize = ({
	finalize,
	writerId,
	seq,
}: {
	finalize: AtomFinalize;
	writerId: string;
	seq: number;
}) => {
	const held = locks.get(finalize.lock_id);
	const track = held?.track ?? lastTrack;
	if (!track)
		throw new Error(`finalize of ${finalize.lock_id} before any track`);
	const state = stateOf(finalize.customer_id);
	const command = parseAtomFinalizeCommand({
		input: {
			schemaVersion: 1,
			type: "atomFinalize",
			requestId: finalize.requestId,
			commandId: finalize.requestId,
			occurredAt: finalize.occurredAt,
			identity: {
				...track.identity,
				customerId: finalize.customer_id,
				entityId: finalize.entity_id,
			},
			org: track.org,
			lockId: finalize.lock_id,
			featureId: finalize.feature_id,
			internalFeatureId: track.internalFeatureId,
			finalValue: finalize.finalValue,
			properties: finalize.properties ?? null,
			source: { atomId: tenant.atomId, writerId, seq },
		},
	});
	const mutation = computeAtomFinalize({
		fullSubject: fullSubjectOf(state),
		command,
		lock: held?.row ?? null,
	});
	states.set(finalize.customer_id, applyMutation({ state, mutation }));
	counts.finalizes++;
	if (!held) counts.finalizesWithoutRow++;
	locks.delete(finalize.lock_id);
};

const balanceOf = (state: SubjectState) =>
	state.customerEntitlements.reduce((sum, row) => sum + row.balance, 0);

/** P1 for the hot customer: what its balance moved, against the locks still open at Autumn. */
const hotLedger = () => {
	const state = stateOf(rigConfig.customers.hotCustomerId);
	return {
		drawn: balanceOf(template.state) - balanceOf(state),
		openLocks: state.openLocks.length,
		lockRowsHeld: locks.size,
	};
};

const subjectOf = (customerId: string) => {
	const state = stateOf(customerId);
	return {
		state,
		catalog: template.catalog,
		org: template.org,
		log_offset: String(logOffset++),
		read_at: readAt++,
		atom_seqs: state.customer.atom_seqs?.[tenant.atomId] ?? null,
	};
};

const bodyOf = (customerId: string): string =>
	JSON.stringify(subjectOf(customerId));

const randomReplica = () =>
	replicaUrls[Math.floor(Math.random() * replicaUrls.length)] as string;

/** As herald queues it: the receiving thread of whichever replica pulls it applies it, and the relay carries it to the other. */
const enqueuePush = ({ customerId }: { customerId: string }) => {
	queue.send(
		atomPushMessageToPayload({
			message: {
				type: AtomPushType.SetSubject,
				atomId: tenant.atomId,
				customerId,
				body: subjectOf(customerId),
			},
		}),
	);
	counts.pushes++;
};

const push = async ({ customerId }: { customerId: string }) => {
	try {
		const reply = await fetch(`${randomReplica()}/v1/subjects.set`, {
			method: "POST",
			headers: {
				"content-type": "application/json",
				"x-atom-token": tenant.token,
				[ATOM_CUSTOMER_ID_HEADER]: customerId,
			},
			body: bodyOf(customerId),
		});
		await reply.arrayBuffer();
		if (reply.ok) counts.pushes++;
		else counts.pushFailed++;
	} catch {
		counts.pushFailed++;
	}
};

const seed = async () => {
	const ids = customerIdsOf({ config: rigConfig });
	let next = 0;
	const lane = async () => {
		while (next < ids.length) await push({ customerId: ids[next++] as string });
	};
	await Promise.all(Array.from({ length: stub.seedConcurrency }, lane));
	return ids.length;
};

const appendTracks = async (request: Request) => {
	const parsed = AtomTracksAppendRequestSchema.safeParse(await request.json());
	if (!parsed.success)
		return Response.json({ code: "unreadable" }, { status: 400 });
	const touched = new Set<string>();
	for (const handedIn of parsed.data.tracks) {
		const { writerId, seq } = handedIn;
		if ("finalize" in handedIn) {
			applyFinalize({ finalize: handedIn.finalize, writerId, seq });
			touched.add(handedIn.finalize.customer_id);
			continue;
		}
		applyTrack({ command: handedIn.command, writerId, seq });
		touched.add(handedIn.command.identity.customerId);
	}
	counts.appends++;
	counts.tracks += parsed.data.tracks.length;
	for (const customerId of touched)
		setTimeout(
			() =>
				stub.pushVia === "queue"
					? enqueuePush({ customerId })
					: void push({ customerId }),
			pushLag(),
		);
	return new Response(null, { status: 204 });
};

/** What the API answers a request a replica leaves to it: allowed, so the caller's count is unchanged. */
const answerForwarded = async (request: Request, pathname: string) => {
	counts.forwarded[pathname] = (counts.forwarded[pathname] ?? 0) + 1;
	const body = (await request.json().catch(() => ({}))) as {
		customer_id?: string;
		value?: number;
	};
	if (pathname === "/v1/track")
		return Response.json(
			{ customer_id: body.customer_id, value: body.value ?? 1, balance: null },
			{ status: 202 },
		);
	return Response.json({ allowed: true, customer_id: body.customer_id });
};

Bun.serve({
	hostname: "0.0.0.0",
	port: stub.port,
	idleTimeout: 60,
	fetch: async (request) => {
		if (queue.isQueueCall(request)) return queue.handle(request);
		const { pathname } = new URL(request.url);
		if (pathname === ATOM_TRACKS_APPEND_PATH) return appendTracks(request);
		if (pathname === ATOM_SUBJECT_READ_PATH) {
			counts.pulls++;
			const { customer_id } = await request.json();
			return new Response(bodyOf(customer_id));
		}
		if (pathname === ATOM_KEYS_PATH) {
			counts.keyChecks++;
			return Response.json({ invalid_key_hashes: [] });
		}
		if (pathname === "/__rig/seed")
			return Response.json({ seeded: await seed() });
		if (pathname === "/__rig/stats")
			return Response.json({
				...counts,
				hot: hotLedger(),
				queue: queue.stats(),
			});
		if (pathname.startsWith("/v1/")) return answerForwarded(request, pathname);
		return new Response("no such route", { status: 404 });
	},
});
console.log("ready");
