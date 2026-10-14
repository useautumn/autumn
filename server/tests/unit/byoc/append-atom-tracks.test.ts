/**
 * POST /atom/tracks.append: an Atom hands in the deductions it granted, by its token hash.
 *
 *  each journaled command is queued as the Atom journaled it, stamped with the Atom, its journal's writer id and its seq → 204;
 *  an unreadable body, or a command off the Atom's own org and env → 400 unreadable; no or unknown hash → 401.
 */

import { afterEach, beforeEach, expect, spyOn, test } from "bun:test";
import type { TrackCommand } from "@autumn/balance-engine";
import {
	ATOM_TOKEN_HASH_HEADER,
	ATOM_TRACKS_APPEND_PATH,
	AtomTracksAppendErrorCode,
} from "@autumn/byoc";
import { AppEnv } from "@autumn/shared";
import { Hono } from "hono";
import * as balanceWorkerClient from "@/external/balanceWorker/getBalanceWorkerClient.js";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import { atomRouter } from "@/internal/byoc/atomRouter.js";
import { cacheDeploymentRepo } from "@/internal/byoc/repos/cacheDeploymentRepo.js";
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

let queued: TrackCommand[][];
const spies: { mockRestore(): void }[] = [];
beforeEach(() => {
	queued = [];
	spies.push(
		spyOn(cacheDeploymentRepo, "findByTokenHash").mockImplementation(
			async ({ tokenHash }) => (tokenHash === TOKEN_HASH ? atom : null),
		),
		spyOn(balanceWorkerClient, "getBalanceWorkerClient").mockReturnValue({
			queue: {
				track: async ({ commands }: { commands: TrackCommand[] }) => {
					queued.push(commands);
				},
			},
		} as never),
	);
});
afterEach(() => {
	for (const spy of spies.splice(0)) spy.mockRestore();
	appendLogs.length = 0;
});

const appendLogs: Record<string, unknown>[] = [];
const logger = {
	info: (_message: string, meta: Record<string, unknown>) => {
		if (meta?.type === "atom_tracks_append") appendLogs.push(meta);
	},
};
const app = new Hono<HonoEnv>();
app.use("*", async (c, next) => {
	c.set("ctx", { db: {}, id: "req_append", logger } as never);
	await next();
});
app.route("/atom", atomRouter);

const append = ({
	tokenHash = TOKEN_HASH,
	body,
}: {
	tokenHash?: string | null;
	body: unknown;
}) =>
	app.request(ATOM_TRACKS_APPEND_PATH, {
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
			writer: "w_1",
			tracks: [
				{ seq: 3, command: first },
				{
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
	expect(appendLogs).toEqual([
		expect.objectContaining({
			atom_id: "atom_1",
			writer: "w_1",
			tracks: 2,
			first_seq: 3,
			last_seq: 4,
			queued: true,
		}),
	]);
	expect(appendLogs[0].lag_ms).toBeGreaterThanOrEqual(0);
});

test("a request carrying several journals stamps each command with its own entry's writer", async () => {
	const first = journaled("atom_req_1");
	const second = journaled("atom_req_2");

	const reply = await append({
		body: {
			tracks: [
				{ writer: "w_1", seq: 3, command: first },
				{ writer: "w_2", seq: 1, command: second },
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

test("an unreadable body, a command that is not a track, or one off the Atom's own org and env is 400 unreadable, and nothing is queued", async () => {
	const track = journaled("atom_req_1");
	for (const body of [
		{ writer: "w_1", tracks: [{ seq: 0, command: track }] },
		{ tracks: [{ seq: 1, command: track }] },
		{
			writer: "w_1",
			tracks: [{ seq: 1, command: { ...track, type: "check" } }],
		},
		{
			writer: "w_1",
			tracks: [
				{
					seq: 1,
					command: {
						...track,
						identity: { ...track.identity, orgId: "org_2" },
					},
				},
			],
		},
		{
			writer: "w_1",
			tracks: [
				{
					seq: 1,
					command: {
						...track,
						identity: { ...track.identity, env: AppEnv.Live },
					},
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
				writer: "w_1",
				tracks: [{ seq: 1, command: journaled("atom_req_1") }],
			},
		});
		expect(reply.status).toBe(401);
		expect(await reply.json()).toMatchObject({
			code: AtomTracksAppendErrorCode.AtomUnknown,
		});
	}
	expect(queued).toEqual([]);
});
