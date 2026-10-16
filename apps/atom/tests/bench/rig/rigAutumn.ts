/**
 * Driver box: Autumn as the replicas see it. Each handed-in track is applied with the engine to its customer's own state
 * and the customer pushed to a random replica after a herald-like lag; settle pulls read the same state. Spawned by
 * rig:driver: `bun run rig:autumn <replicaUrl,...>`.
 */
import {
	type AtomFinalizeCommand,
	applyMutation,
	computeAtomFinalize,
	computeTrack,
	findLockInsertInMutation,
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
import { createTrackCommand } from "../../../../../packages/balance-engine/tests/unit/engineFixtures.js";
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
const counts = {
	tracks: 0,
	appends: 0,
	pushes: 0,
	pushFailed: 0,
	pulls: 0,
	keyChecks: 0,
	forwarded: {} as Record<string, number>,
	/** Hand-ins at or below a writer's seq the customer already holds: Autumn's worker applies nothing for them. */
	replays: 0,
	forwardedDeductions: 0,
	/** Finalizes handed in and applied with the engine, as the worker settles Autumn's own row: the lock leaves the pushed state. */
	finalizes: 0,
	/** Finalizes handed in for a lock this stub holds no row for (never taken here, or settled already): the engine lands only the seq. */
	finalizesWithoutLock: 0,
	/** Lock ids settled more than once, by hand-in or by a forwarded finalize: a double settle. */
	finalizeDupes: 0,
};
const settledLocks = new Map<string, number>();
/** Autumn's own row for each open lock, as balance_locks holds it, kept from the track that took it until its finalize. */
const lockRows = new Map<string, WorkerLock>();
const recordSettled = ({ lockId }: { lockId: string }) => {
	const n = (settledLocks.get(lockId) ?? 0) + 1;
	settledLocks.set(lockId, n);
	if (n === 2) counts.finalizeDupes++;
};
/** Each deduction applied, by the key the caller's Idempotency-Key gave it; a count above 1 is a double deduction. */
const applied = new Map<string, number>();
const recordApplied = (key: string) =>
	applied.set(key, (applied.get(key) ?? 0) + 1);

const stateOf = (customerId: string): SubjectState => {
	const held = states.get(customerId);
	if (held) return held;
	return {
		...template.state,
		identity: { ...template.state.identity, customerId },
	};
};

/** As the worker lands a finalize: Autumn's own row settled by the engine, once per (writer, seq) (isLandedSeq), the seq landing with it. */
const applyFinalize = ({
	finalize,
	writerId,
	seq,
}: {
	finalize: AtomFinalize;
	writerId: string;
	seq: number;
}) => {
	const state = stateOf(finalize.customer_id);
	if (seq <= (state.customer.atom_seqs?.[tenant.atomId]?.[writerId] ?? 0)) {
		counts.replays++;
		return;
	}
	const lock = lockRows.get(finalize.lock_id) ?? null;
	const command: AtomFinalizeCommand = {
		schemaVersion: 1,
		type: "atomFinalize",
		requestId: finalize.requestId,
		commandId: finalize.requestId,
		occurredAt: finalize.occurredAt,
		identity: {
			...template.state.identity,
			customerId: finalize.customer_id,
			entityId: finalize.entity_id,
		},
		org: template.org,
		lockId: finalize.lock_id,
		featureId: finalize.feature_id,
		internalFeatureId:
			template.catalog.features[finalize.feature_id]?.internal_id ??
			finalize.feature_id,
		finalValue: finalize.finalValue,
		properties: (finalize.properties ??
			null) as AtomFinalizeCommand["properties"],
		source: { atomId: tenant.atomId, writerId, seq },
	};
	const mutation = computeAtomFinalize({
		fullSubject: subjectStateToFullSubject({
			state,
			catalog: template.catalog,
		}),
		command,
		lock,
	});
	states.set(finalize.customer_id, applyMutation({ state, mutation }));
	if (lock) {
		lockRows.delete(finalize.lock_id);
		counts.finalizes++;
		recordSettled({ lockId: finalize.lock_id });
	} else counts.finalizesWithoutLock++;
};

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
	// The worker's replay guard: a journal re-sent after a restart lands no seq twice.
	if (seq <= (state.customer.atom_seqs?.[tenant.atomId]?.[writerId] ?? 0)) {
		counts.replays++;
		return;
	}
	const mutation = computeTrack({
		fullSubject: subjectStateToFullSubject({
			state,
			catalog: template.catalog,
		}),
		command: { ...command, source: { atomId: tenant.atomId, writerId, seq } },
	});
	states.set(customerId, applyMutation({ state, mutation }));
	const lockRow = findLockInsertInMutation({ mutation });
	if (lockRow) lockRows.set(lockRow.lock_id, lockRow);
	recordApplied(command.idempotency?.key ?? command.commandId);
};

/** A deduction a replica left to the API, deducted here as the API's worker would, under the caller's key. */
const applyForwardedDeduction = ({
	customerId,
	featureId,
	value,
	key,
}: {
	customerId: string;
	featureId: string;
	value: number;
	key: string;
}) => {
	const state = stateOf(customerId);
	const command = createTrackCommand({
		commandId: key,
		requestId: key,
		featureId,
		value,
		overageBehavior: "overflow",
	});
	const mutation = computeTrack({
		fullSubject: subjectStateToFullSubject({
			state,
			catalog: template.catalog,
		}),
		command: { ...command, identity: { ...command.identity, customerId } },
	});
	states.set(customerId, applyMutation({ state, mutation }));
	recordApplied(key);
	counts.forwardedDeductions++;
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

const pushAfterLag = ({ customerId }: { customerId: string }) =>
	setTimeout(
		() =>
			stub.pushVia === "queue"
				? enqueuePush({ customerId })
				: void push({ customerId }),
		pushLag(),
	);

const appendTracks = async (request: Request) => {
	const parsed = AtomTracksAppendRequestSchema.safeParse(await request.json());
	if (!parsed.success)
		return Response.json({ code: "unreadable" }, { status: 400 });
	const touched = new Set<string>();
	for (const track of parsed.data.tracks) {
		if (!("command" in track)) {
			if ("finalize" in track) {
				applyFinalize({
					finalize: track.finalize,
					writerId: track.writerId,
					seq: track.seq,
				});
				touched.add(track.finalize.customer_id);
			}
			continue;
		}
		applyTrack({
			command: track.command,
			writerId: track.writerId,
			seq: track.seq,
		});
		touched.add(track.command.identity.customerId);
	}
	counts.appends++;
	counts.tracks += parsed.data.tracks.length;
	for (const customerId of touched) pushAfterLag({ customerId });
	return new Response(null, { status: 204 });
};

/**
 * What the API answers a request a replica leaves to it: allowed, and a deduction is applied here under the caller's
 * Idempotency-Key and pushed back after herald's lag, as the API's worker does; so the caller's count is unchanged.
 */
const answerForwarded = async (request: Request, pathname: string) => {
	counts.forwarded[pathname] = (counts.forwarded[pathname] ?? 0) + 1;
	const body = (await request.json().catch(() => ({}))) as {
		customer_id?: string;
		feature_id?: string;
		value?: number;
		send_event?: boolean;
		lock_id?: string;
	};
	if (pathname === "/v1/balances.finalize") {
		if (body.lock_id) recordSettled({ lockId: body.lock_id });
		return Response.json({ success: true });
	}
	const deducts = pathname === "/v1/track" || body.send_event === true;
	if (deducts && body.customer_id && body.feature_id) {
		applyForwardedDeduction({
			customerId: body.customer_id,
			featureId: body.feature_id,
			value: body.value ?? 1,
			key: request.headers.get("idempotency-key") ?? crypto.randomUUID(),
		});
		pushAfterLag({ customerId: body.customer_id });
	}
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
				openLocks: lockRows.size,
				hotOpenLocks: subjectStateToFullSubject({
					state: stateOf(rigConfig.customers.hotCustomerId),
					catalog: template.catalog,
				}).open_locks.length,
				queue: queue.stats(),
			});
		if (pathname === "/__rig/applied")
			return Response.json({ applied: Object.fromEntries(applied) });
		if (pathname.startsWith("/v1/")) return answerForwarded(request, pathname);
		return new Response("no such route", { status: 404 });
	},
});
console.log("ready");
