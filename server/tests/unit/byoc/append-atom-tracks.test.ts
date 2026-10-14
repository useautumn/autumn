/**
 * POST /atom/tracks.append: an Atom hands in the deductions it granted, by its token hash.
 *
 *  each journaled track is queued as the Atom journaled it, and each finalize naming its lock, in request order, stamped
 *  with the Atom, its journal's writer id and its seq → 204;
 *  an unreadable body, a command off the Atom's own org and env, or a finalize of an unknown feature → 400; no or unknown hash → 401;
 *  a queued lock with a caller-set expiry arms an expiry timer named for that lock instance (its row id), once across
 *  resends; a confirm lock, or a hand-in never queued, arms none.
 */

import { afterEach, beforeEach, expect, spyOn, test } from "bun:test";
import type { AtomFinalizeCommand, TrackCommand } from "@autumn/balance-engine";
import {
	ATOM_SUBJECT_READ_PATH,
	ATOM_TOKEN_HASH_HEADER,
	ATOM_TRACKS_APPEND_PATH,
	AtomTracksAppendErrorCode,
} from "@autumn/byoc";
import { AppEnv, OrgConfigSchema } from "@autumn/shared";
import { ConflictException } from "@aws-sdk/client-scheduler";
import { Hono } from "hono";
import * as balanceWorkerClient from "@/external/balanceWorker/getBalanceWorkerClient.js";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import { buildLockScheduleName } from "@/internal/balances/utils/lock/buildLockScheduleName.js";
import { atomRouter } from "@/internal/byoc/atomRouter.js";
import { cacheDeploymentRepo } from "@/internal/byoc/repos/cacheDeploymentRepo.js";
import * as orgCache from "@/internal/orgs/orgUtils/getOrgWithFeaturesCached.js";
import { workflows } from "@/queue/workflows.js";
import { createTrackCommand } from "../../../../packages/balance-engine/tests/unit/engineFixtures.js";

const TOKEN_HASH = "a".repeat(64);
const atom = {
	id: "atom_1",
	orgId: "org_1",
	env: AppEnv.Sandbox,
	encryptedToken: "encrypted_org_atom",
};

const journaled = (commandId: string): TrackCommand => ({
	...createTrackCommand({ commandId }),
	idempotency: { key: `track:${commandId}`, ttlMs: 86_400_000 },
});

/** The Atom's release of L1, named as the API names it. */
const release = ({ featureId = "messages" }: { featureId?: string } = {}) => ({
	requestId: "atom_release_1",
	occurredAt: 1_700_000_000_000,
	customer_id: "cus_1",
	lock_id: "L1",
	entity_id: "ent_1",
	feature_id: featureId,
	finalValue: 0,
});

let queued: (TrackCommand | AtomFinalizeCommand)[][];
let orgLookups: number;
/** EventBridge schedules by name; creating a name that exists fails, as EventBridge's CreateSchedule does. */
let schedules: Map<string, { payload: unknown; scheduleAt: Date }>;
let errorsLogged: string[];
const spies: { mockRestore(): void }[] = [];
beforeEach(() => {
	queued = [];
	orgLookups = 0;
	schedules = new Map();
	errorsLogged = [];
	spies.push(
		spyOn(workflows, "triggerExpireLockReceipt").mockImplementation(
			async (payload, { scheduleAt, scheduleName }) => {
				if (schedules.has(scheduleName))
					throw new ConflictException({
						message: `Schedule ${scheduleName} already exists`,
						Message: `Schedule ${scheduleName} already exists`,
						$metadata: {},
					});
				schedules.set(scheduleName, { payload, scheduleAt });
			},
		),
		spyOn(orgCache, "getOrgWithFeaturesCached").mockImplementation(async () => {
			orgLookups++;
			return {
				org: { id: "org_1", slug: "org-1", config: OrgConfigSchema.parse({}) },
				features: [{ id: "messages", internal_id: "feat_messages" }],
			} as never;
		}),
		spyOn(cacheDeploymentRepo, "findByTokenHash").mockImplementation(
			async ({ tokenHash }) => (tokenHash === TOKEN_HASH ? atom : null),
		),
		spyOn(balanceWorkerClient, "getBalanceWorkerClient").mockReturnValue({
			enqueue: async ({
				commands,
			}: {
				commands: (TrackCommand | AtomFinalizeCommand)[];
			}) => {
				queued.push(commands);
			},
		} as never),
	);
});
afterEach(() => {
	for (const spy of spies.splice(0)) spy.mockRestore();
});

const app = new Hono<HonoEnv>();
app.use("*", async (c, next) => {
	c.set("ctx", {
		db: {},
		id: "req_append",
		logger: { error: (message: string) => errorsLogged.push(message) },
	} as never);
	await next();
});
app.route("/atom", atomRouter);

const append = ({
	tokenHash = TOKEN_HASH,
	body,
	path = ATOM_TRACKS_APPEND_PATH,
}: {
	tokenHash?: string | null;
	body: unknown;
	path?: string;
}) =>
	app.request(path, {
		method: "POST",
		headers: {
			"content-type": "application/json",
			...(tokenHash && { [ATOM_TOKEN_HASH_HEADER]: tokenHash }),
		},
		body: JSON.stringify(body),
	});

test("each journaled command is queued as the Atom journaled it, stamped with the Atom, its journal and its seq", async () => {
	const first = journaled("atom_req_1");
	const second = journaled("atom_req_2");

	const reply = await append({
		body: {
			tracks: [
				{ writerId: "w_1", seq: 3, command: first },
				{
					writerId: "w_1",
					seq: 4,
					command: {
						...second,
						source: { atomId: "spoofed", writerId: "spoofed", seq: 99 },
					},
				},
			],
		},
	});

	expect(reply.status).toBe(204);
	expect(queued).toEqual([
		[
			{ ...first, source: { atomId: "atom_1", writerId: "w_1", seq: 3 } },
			{ ...second, source: { atomId: "atom_1", writerId: "w_1", seq: 4 } },
		],
	]);
});

test("a lock's track and its finalize in one request are queued in order; the finalize is the Atom's own command, naming its lock and never a row", async () => {
	const lockTrack = journaled("atom_req_1");

	const reply = await append({
		body: {
			tracks: [
				{ writerId: "w_1", seq: 1, command: lockTrack },
				{ writerId: "w_1", seq: 2, finalize: release() },
			],
		},
	});

	expect(reply.status).toBe(204);
	expect(queued).toEqual([
		[
			{ ...lockTrack, source: { atomId: "atom_1", writerId: "w_1", seq: 1 } },
			{
				schemaVersion: 1,
				type: "atomFinalize",
				requestId: "atom_release_1",
				commandId: "atom_release_1",
				occurredAt: 1_700_000_000_000,
				identity: {
					orgId: "org_1",
					env: AppEnv.Sandbox,
					customerId: "cus_1",
					entityId: "ent_1",
				},
				org: expect.objectContaining({ slug: "org-1" }),
				lockId: "L1",
				featureId: "messages",
				internalFeatureId: "feat_messages",
				finalValue: 0,
				properties: null,
				source: { atomId: "atom_1", writerId: "w_1", seq: 2 },
			},
		],
	]);
});

test("a request carrying several journals stamps each command with its own track's writer id", async () => {
	const first = journaled("atom_req_1");
	const second = journaled("atom_req_2");

	const reply = await append({
		body: {
			tracks: [
				{ writerId: "w_1", seq: 3, command: first },
				{ writerId: "w_2", seq: 1, command: second },
			],
		},
	});

	expect(reply.status).toBe(204);
	expect(queued).toEqual([
		[
			{ ...first, source: { atomId: "atom_1", writerId: "w_1", seq: 3 } },
			{ ...second, source: { atomId: "atom_1", writerId: "w_2", seq: 1 } },
		],
	]);
});

test("an unreadable body, a command that is neither a track nor a finalize, one off the Atom's own org and env, or a finalize of a feature the org lacks is 400 unreadable, and nothing is queued", async () => {
	const track = journaled("atom_req_1");
	for (const body of [
		{ tracks: [{ writerId: "w_1", seq: 0, command: track }] },
		{ tracks: [{ seq: 1, command: track }] },
		{
			tracks: [
				{ writerId: "w_1", seq: 1, command: { ...track, type: "check" } },
			],
		},
		{
			tracks: [
				{
					writerId: "w_1",
					seq: 1,
					command: {
						...track,
						identity: { ...track.identity, orgId: "org_2" },
					},
				},
			],
		},
		{
			tracks: [
				{
					writerId: "w_1",
					seq: 1,
					command: {
						...track,
						identity: { ...track.identity, env: AppEnv.Live },
					},
				},
			],
		},
		{
			tracks: [
				{
					writerId: "w_1",
					seq: 1,
					finalize: release({ featureId: "unknown_feature" }),
				},
			],
		},
	]) {
		const reply = await append({ body });
		expect(reply.status).toBe(400);
		expect(await reply.json()).toMatchObject({
			code: AtomTracksAppendErrorCode.Unreadable,
		});
	}
	expect(queued).toEqual([]);
});

test("no hash or an unknown one is 401 atom_unknown, and nothing is queued", async () => {
	for (const tokenHash of [null, "f".repeat(64)]) {
		const reply = await append({
			tokenHash,
			body: {
				tracks: [{ writerId: "w_1", seq: 1, command: journaled("atom_req_1") }],
			},
		});
		expect(reply.status).toBe(401);
		expect(await reply.json()).toMatchObject({
			code: AtomTracksAppendErrorCode.AtomUnknown,
		});
	}
	expect(queued).toEqual([]);
});

test("an Atom whose org is gone is 401 atom_unknown on every Atom route, before its body is read, from one org lookup", async () => {
	spyOn(orgCache, "getOrgWithFeaturesCached").mockImplementation(async () => {
		orgLookups++;
		return null;
	});
	for (const path of [ATOM_TRACKS_APPEND_PATH, ATOM_SUBJECT_READ_PATH]) {
		const reply = await append({ path, body: { unreadable: true } });
		expect(reply.status).toBe(401);
		expect(await reply.json()).toMatchObject({
			code: AtomTracksAppendErrorCode.AtomUnknown,
		});
	}
	expect(orgLookups).toBe(2);
	expect(queued).toEqual([]);
});

const lockedWith = ({
	commandId,
	rowId = `lck_${commandId}`,
	expiresAt = 1_700_000_060_000,
	expiryAction = "release",
}: {
	commandId: string;
	rowId?: string;
	expiresAt?: number;
	expiryAction?: "release" | "confirm";
}): TrackCommand => ({
	...journaled(commandId),
	lock: { id: rowId, lockId: "L1", expiresAt, expiryAction },
});

const timerOf = ({
	rowId,
	expiresAt,
}: {
	rowId: string;
	expiresAt: number;
}): [string, { payload: unknown; scheduleAt: Date }] => {
	const hashedKey = Bun.hash(rowId).toString();
	return [
		buildLockScheduleName({ orgId: "org_1", env: AppEnv.Sandbox, hashedKey }),
		{
			payload: {
				orgId: "org_1",
				env: AppEnv.Sandbox,
				customerId: "cus_1",
				lockId: "L1",
				hashedKey,
				lockRowId: rowId,
			},
			scheduleAt: new Date(expiresAt),
		},
	];
};

test("a lock with a caller-set expiry arms a timer named for its row; a resend finds it armed and logs nothing", async () => {
	const body = {
		tracks: [
			{
				writerId: "w_1",
				seq: 1,
				command: lockedWith({ commandId: "atom_req_1" }),
			},
		],
	};

	expect((await append({ body })).status).toBe(204);
	expect((await append({ body })).status).toBe(204);

	expect([...schedules]).toEqual([
		timerOf({ rowId: "lck_atom_req_1", expiresAt: 1_700_000_060_000 }),
	]);
	expect(errorsLogged).toEqual([]);
});

test("a lock id taken again after its lock settled gets its own timer, beside the first", async () => {
	await append({
		body: {
			tracks: [
				{
					writerId: "w_1",
					seq: 1,
					command: lockedWith({ commandId: "atom_req_1" }),
				},
			],
		},
	});
	await append({
		body: {
			tracks: [
				{
					writerId: "w_1",
					seq: 3,
					command: lockedWith({
						commandId: "atom_req_2",
						expiresAt: 1_700_000_120_000,
					}),
				},
			],
		},
	});

	expect([...schedules]).toEqual([
		timerOf({ rowId: "lck_atom_req_1", expiresAt: 1_700_000_060_000 }),
		timerOf({ rowId: "lck_atom_req_2", expiresAt: 1_700_000_120_000 }),
	]);
});

test("a lock confirmed on expiry arms no timer: the sweep settles it", async () => {
	const reply = await append({
		body: {
			tracks: [
				{
					writerId: "w_1",
					seq: 1,
					command: lockedWith({
						commandId: "atom_req_1",
						expiryAction: "confirm",
					}),
				},
			],
		},
	});

	expect(reply.status).toBe(204);
	expect(queued).toHaveLength(1);
	expect(schedules.size).toBe(0);
});

test("a hand-in the worker never queued arms no timer: the Atom resends it whole", async () => {
	spies.push(
		spyOn(balanceWorkerClient, "getBalanceWorkerClient").mockReturnValue({
			enqueue: async () => {
				throw new Error("kafka away");
			},
		} as never),
	);
	const reply = await append({
		body: {
			tracks: [
				{
					writerId: "w_1",
					seq: 1,
					command: lockedWith({ commandId: "atom_req_1" }),
				},
			],
		},
	});

	expect(reply.status).not.toBe(204);
	expect(schedules.size).toBe(0);
});
