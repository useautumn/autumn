/**
 * POST /atom/subjects.read: an Atom pulls a subject it missed, by its token hash.
 *
 *  3.1 a subject herald pushes to this Atom, on the worker → 200, the exact subjects.set body with the worker's offset;
 *  3.4 + 3.5 (R13) off the worker, or this Atom not one of the subject's targets → 409, and the worker is never read;
 *  3.3 the worker says the customer or entity does not exist → 404; 3.8 a worker failure, or no offset → 503;
 *  3.6 no or unknown hash → 401; 3.9 an unreadable body → 400.
 */

import { afterAll, afterEach, beforeAll, expect, spyOn, test } from "bun:test";
import type { ReadSubjectStateCommand } from "@autumn/balance-engine";
import { BalanceWorkerClientError } from "@autumn/balance-worker-client";
import type { ReadSubjectStateReply } from "@autumn/balance-worker-client/protocol";
import {
	ATOM_SUBJECT_READ_PATH,
	ATOM_TOKEN_HASH_HEADER,
	AtomSubjectReadErrorCode,
} from "@autumn/byoc";
import {
	AppEnv,
	ByocCacheStatus,
	type Organization,
	OrgConfigSchema,
} from "@autumn/shared";
import { Hono } from "hono";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import { readAtomSubject } from "@/internal/byoc/actions/subjects/readAtomSubject.js";
import { atomRouter } from "@/internal/byoc/atomRouter.js";
import { cacheDeploymentRepo } from "@/internal/byoc/repos/cacheDeploymentRepo.js";
import { _setShadowAtomConfigForTesting } from "@/internal/misc/shadowAtom/shadowAtomConfigStore.js";
import * as orgCache from "@/internal/orgs/orgUtils/getOrgWithFeaturesCached.js";

const previousRollout = process.env.BALANCE_WORKER_ROLLOUT_ENABLED;
beforeAll(() => {
	_setShadowAtomConfigForTesting({ config: { endpointUrl: null, orgs: {} } });
});
afterEach(() => {
	process.env.BALANCE_WORKER_ROLLOUT_ENABLED = "true";
});
afterAll(() => {
	if (previousRollout === undefined)
		delete process.env.BALANCE_WORKER_ROLLOUT_ENABLED;
	else process.env.BALANCE_WORKER_ROLLOUT_ENABLED = previousRollout;
});

/** The org's own sandbox Atom, ready, as its cached org lists it. */
const org = {
	id: "org_pull",
	is_sandbox: false,
	created_by: null,
	config: OrgConfigSchema.parse({}),
	default_currency: "usd",
	atomDeployments: [
		{
			status: ByocCacheStatus.Ready,
			deployment_id: "dep_1",
			endpoint_url: "https://org-atom.example.com",
			encrypted_token: "encrypted_org_atom",
		},
	],
} as unknown as Organization;

const orgAtom = { env: AppEnv.Sandbox, encryptedToken: "encrypted_org_atom" };
const logger = { warn() {}, info() {}, error() {}, debug() {} };

/** A worker that answers `reply` (or throws it), recording each read it was asked for. */
const workerAnswering = (reply: Partial<ReadSubjectStateReply> | Error) => {
	const reads: ReadSubjectStateCommand[] = [];
	return {
		reads,
		client: {
			readSubjectState: async ({
				command,
			}: {
				command: ReadSubjectStateCommand;
			}) => {
				reads.push(command);
				if (reply instanceof Error) throw reply;
				return {
					state: { customer: {} },
					catalog: {},
					...reply,
				} as ReadSubjectStateReply;
			},
		},
	};
};

const read = ({
	client,
	atom = orgAtom,
}: {
	client: ReturnType<typeof workerAnswering>["client"];
	atom?: typeof orgAtom;
}) =>
	readAtomSubject({
		ctx: { logger, id: "req_pull" } as never,
		org,
		atom,
		customerId: "cus_1",
		entityId: "ent_1",
		client,
	});

test("3.1 a subject herald pushes to this Atom: the subjects.set body, with the worker's offset", async () => {
	process.env.BALANCE_WORKER_ROLLOUT_ENABLED = "true";
	const worker = workerAnswering({ logOffset: "180" });
	const result = await read({ client: worker.client });
	expect(result).toEqual({
		kind: "body",
		body: {
			state: { customer: {} },
			catalog: {},
			org: { config: org.config, default_currency: "usd" },
			log_offset: "180",
			read_at: expect.any(Number),
		},
	} as never);
	expect(worker.reads[0]).toMatchObject({
		type: "readSubjectState",
		requestId: "req_pull",
		identity: {
			orgId: "org_pull",
			env: AppEnv.Sandbox,
			customerId: "cus_1",
			entityId: "ent_1",
		},
	});
});

test("3.4 + 3.5 (R13) off the worker, or not one of the subject's targets: not held, and the worker is never read", async () => {
	process.env.BALANCE_WORKER_ROLLOUT_ENABLED = "false";
	const offWorker = workerAnswering({ logOffset: "1" });
	expect(await read({ client: offWorker.client })).toEqual({
		kind: "not_held",
	});

	process.env.BALANCE_WORKER_ROLLOUT_ENABLED = "true";
	const otherAtom = workerAnswering({ logOffset: "1" });
	expect(
		await read({
			client: otherAtom.client,
			atom: { ...orgAtom, encryptedToken: "encrypted_other_atom" },
		}),
	).toEqual({ kind: "not_held" });
	expect([...offWorker.reads, ...otherAtom.reads]).toEqual([]);
});

test("3.3 + 3.8 the worker's not-found is not found; any other failure, or a reply without an offset, is unavailable", async () => {
	process.env.BALANCE_WORKER_ROLLOUT_ENABLED = "true";
	for (const workerCode of ["CUSTOMER_NOT_FOUND", "ENTITY_NOT_FOUND"] as const)
		expect(
			await read({
				client: workerAnswering(
					new BalanceWorkerClientError({
						code: "WORKER_ERROR",
						outcome: "unknown",
						message: "not found",
						workerCode,
					}),
				).client,
			}),
		).toEqual({ kind: "not_found" });

	const noOwner = new BalanceWorkerClientError({
		code: "NO_OWNER",
		outcome: "not_submitted",
		message: "no owner",
	});
	expect(await read({ client: workerAnswering(noOwner).client })).toEqual({
		kind: "worker_unavailable",
	});
	expect(await read({ client: workerAnswering({}).client })).toEqual({
		kind: "worker_unavailable",
	});
});

/** The Atom router as the server mounts it, with the token-hash lookup and org cache stubbed. */
const createApp = () => {
	const app = new Hono<HonoEnv>();
	app.use("*", async (c, next) => {
		c.set("ctx", { db: {}, logger, id: "req_route" } as never);
		await next();
	});
	app.route("/atom", atomRouter);
	return app;
};

const post = ({
	app,
	tokenHash,
	body,
}: {
	app: Hono<HonoEnv>;
	tokenHash?: string;
	body: unknown;
}) =>
	app.request(ATOM_SUBJECT_READ_PATH, {
		method: "POST",
		headers: {
			"content-type": "application/json",
			...(tokenHash && { [ATOM_TOKEN_HASH_HEADER]: tokenHash }),
		},
		body: JSON.stringify(body),
	});

test("3.6 + 3.9 the route: an unreadable body is 400; no hash or an unknown one is 401 atom_unknown; off the worker is 409", async () => {
	const findByTokenHash = spyOn(
		cacheDeploymentRepo,
		"findByTokenHash",
	).mockImplementation(async ({ tokenHash }) =>
		tokenHash === "a".repeat(64) ? { orgId: org.id, ...orgAtom } : null,
	);
	const orgLookup = spyOn(
		orgCache,
		"getOrgWithFeaturesCached",
	).mockResolvedValue({ org, features: [] } as never);
	try {
		const app = createApp();
		const subject = { customer_id: "cus_1", entity_id: null };

		expect(
			(await post({ app, tokenHash: "a".repeat(64), body: { entity_id: 1 } }))
				.status,
		).toBe(400);

		for (const tokenHash of [undefined, "f".repeat(64)]) {
			const unknown = await post({ app, tokenHash, body: subject });
			expect(unknown.status).toBe(401);
			expect(await unknown.json()).toMatchObject({
				code: AtomSubjectReadErrorCode.AtomUnknown,
			});
		}

		process.env.BALANCE_WORKER_ROLLOUT_ENABLED = "false";
		const notHeld = await post({
			app,
			tokenHash: "a".repeat(64),
			body: subject,
		});
		expect(notHeld.status).toBe(409);
		expect(await notHeld.json()).toMatchObject({
			code: AtomSubjectReadErrorCode.SubjectNotHeld,
		});
	} finally {
		findByTokenHash.mockRestore();
		orgLookup.mockRestore();
	}
});
