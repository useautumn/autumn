/**
 * Herald builds its subjects.set body through the shared builder the server's pull also uses: the same body as before,
 * except that log_offset is the offset the worker's read covers, with the record's offset when the worker names none.
 *
 *  2.1 the worker's logOffset is the body's; 2.2 without one, the record's; 2.4 an evict's version rides along;
 *  2.5 read_at is taken before the worker read; and the body and the read it sends are exactly herald's old ones.
 *  A subject its worker no longer holds is sent to subjects.delete instead; any other failure sends nothing.
 */

import { afterEach, beforeEach, expect, spyOn, test } from "bun:test";
import type {
	MeteringIdentity,
	ReadSubjectStateCommand,
} from "@autumn/balance-engine";
import { BalanceWorkerClientError } from "@autumn/balance-worker-client";
import type { ReadSubjectStateReply } from "@autumn/balance-worker-client/protocol";
import { _resetOrgWithFeaturesL1ForTesting } from "@autumn/cache";
import { ShadowAtomConfigSchema } from "@autumn/edge-config";
import {
	AppEnv,
	ByocCacheStatus,
	type Organization,
	OrgConfigSchema,
} from "@autumn/shared";
import { WORKER_ERROR_CODES } from "../../../../../../packages/balance-worker-client/src/contracts/worker.js";
import { BALANCE_WORKER_CLIENT_ERROR_CODES } from "../../../../../../packages/balance-worker-client/src/types/balanceWorkerClientErrors.js";
import { pushSubjectToCache } from "../../../../src/consumers/cachePush/pushSubjectToCache/pushSubjectToCache.js";
import type { CachePushContext } from "../../../../src/consumers/cachePush/types/cachePushContext.js";

const org = {
	id: "org_1",
	slug: "org-1",
	config: OrgConfigSchema.parse({}),
	default_currency: "usd",
} as unknown as Organization;

const identity = {
	orgId: "org_1",
	env: AppEnv.Sandbox,
	customerId: "cus_1",
	entityId: null,
};

const workerState = { customer: { id: "cus_1" } } as const;
const workerCatalog = { features: {} } as const;

/** org_1 with its own ready Atom, whose worker answers `reply` (or throws `refusal`) and moves the clock to 2 000 while it reads. */
const createBodyContext = ({
	reply = {},
	refusal,
}: {
	reply?: Partial<ReadSubjectStateReply>;
	refusal?: unknown;
}) => {
	const bodies: unknown[] = [];
	const deletions: unknown[] = [];
	const commands: ReadSubjectStateCommand[] = [];
	const atomDeployments = [
		{
			status: ByocCacheStatus.Ready,
			deployment_id: "dep_1",
			endpoint_url: "https://org-atom.example.com",
			encrypted_token: "encrypted",
		},
	];
	const ctx = {
		miscCache: {
			resolve: () => ({
				status: "ready",
				get: async () =>
					JSON.stringify({ org: { ...org, atomDeployments }, features: [] }),
			}),
			forEachTarget: async () => [],
		},
		logger: { info() {}, warn() {}, error() {}, debug() {} },
		db: {},
		balanceWorkerClient: {
			readSubjectState: async ({
				command,
			}: {
				command: ReadSubjectStateCommand;
			}) => {
				commands.push(command);
				now = 2_000;
				if (refusal) throw refusal;
				return { state: workerState, catalog: workerCatalog, ...reply };
			},
		},
		shadowAtomConfig: {
			get: () =>
				ShadowAtomConfigSchema.parse({
					endpointUrl: null,
					pushTransport: "http",
					adminEncryptedToken: "encrypted_admin",
					orgs: {},
				}),
		},
		atomPushQueueOnly: false,
		getAtomClient: () => ({
			setSubject: async ({ body }: { body: unknown }) => {
				bodies.push(body);
			},
			deleteSubject: async ({ body }: { body: unknown }) => {
				deletions.push(body);
			},
			setCatalog: async () => undefined,
		}),
	} as unknown as CachePushContext;
	return { ctx, bodies, deletions, commands };
};

const pushSubject = ({
	ctx,
	customerVersion = null,
	subject = identity,
}: {
	ctx: CachePushContext;
	customerVersion?: bigint | null;
	subject?: MeteringIdentity;
}) =>
	pushSubjectToCache({
		ctx,
		cacheSubject: {
			identity: subject,
			logOffset: 120n,
			oldestOccurredAt: 1,
			customerVersion,
		},
	});

let now = 1_000;
beforeEach(() => {
	now = 1_000;
	spyOn(Date, "now").mockImplementation(() => now);
	_resetOrgWithFeaturesL1ForTesting();
});
afterEach(() => {
	(Date.now as unknown as { mockRestore(): void }).mockRestore();
});

test("2.1 + 2.5 the body is herald's old body, with the worker's log offset and read_at from before the read", async () => {
	const { ctx, bodies, commands } = createBodyContext({
		reply: { logOffset: "180" },
	});
	await pushSubject({ ctx });

	expect(bodies).toEqual([
		{
			state: workerState,
			catalog: workerCatalog,
			org: { config: org.config, default_currency: "usd" },
			log_offset: "180",
			read_at: 1_000,
			atom_seqs: null,
		},
	]);
	expect(commands).toHaveLength(1);
	expect(commands[0]).toMatchObject({
		schemaVersion: 1,
		type: "readSubjectState",
		identity,
		occurredAt: 1_000,
	});
	expect(commands[0]?.requestId).toStartWith("herald_cache_push_");
});

test("2.2 a worker that names no offset: the record's offset, exactly as before", async () => {
	const { ctx, bodies } = createBodyContext({ reply: {} });
	await pushSubject({ ctx });
	expect(bodies).toEqual([
		{
			state: workerState,
			catalog: workerCatalog,
			org: { config: org.config, default_currency: "usd" },
			log_offset: "120",
			read_at: 1_000,
			atom_seqs: null,
		},
	]);
});

test("2.4 an evict's version still rides on the customer's body", async () => {
	const { ctx, bodies } = createBodyContext({ reply: { logOffset: "180" } });
	await pushSubject({ ctx, customerVersion: 140n });
	expect(bodies).toEqual([
		expect.objectContaining({ log_offset: "180", customer_version: "140" }),
	]);
});

/** The worker refusing a read with `workerCode`, as its client throws it. */
const workerRefusal = (workerCode: BalanceWorkerClientError["workerCode"]) =>
	new BalanceWorkerClientError({
		code: "WORKER_ERROR",
		outcome: "not_submitted",
		message: "refused",
		workerCode,
	});

test("a customer its worker no longer holds is sent to subjects.delete, at the record's offset and read_at from before the read", async () => {
	const { ctx, bodies, deletions } = createBodyContext({
		refusal: workerRefusal("CUSTOMER_NOT_FOUND"),
	});

	await pushSubject({ ctx });

	expect(bodies).toEqual([]);
	expect(deletions).toEqual([{ identity, log_offset: "120", read_at: 1_000 }]);
});

test("an entity its worker no longer holds is sent to subjects.delete, under the entity", async () => {
	const entity = { ...identity, entityId: "ent_1" };
	const { ctx, deletions } = createBodyContext({
		refusal: workerRefusal("ENTITY_NOT_FOUND"),
	});

	await pushSubject({ ctx, subject: entity });

	expect(deletions).toEqual([
		{ identity: entity, log_offset: "120", read_at: 1_000 },
	]);
});

const NOT_FOUND_CODES = new Set(["CUSTOMER_NOT_FOUND", "ENTITY_NOT_FOUND"]);

/** Every way a worker read fails other than the worker's own not-found: each must fail the push and delete nothing. */
const failuresThatAreNotDeletes: { name: string; error: unknown }[] = [
	...WORKER_ERROR_CODES.filter((code) => !NOT_FOUND_CODES.has(code)).map(
		(workerCode) => ({
			name: `the worker answering ${workerCode}`,
			error: workerRefusal(workerCode),
		}),
	),
	...BALANCE_WORKER_CLIENT_ERROR_CODES.filter(
		(code) => code !== "WORKER_ERROR",
	).map((code) => ({
		name: `the client failing with ${code}`,
		error: new BalanceWorkerClientError({
			code,
			outcome: "unknown",
			message: "refused",
		}),
	})),
	{ name: "a network error", error: new TypeError("refused: fetch failed") },
	{
		name: "a timeout",
		error: new DOMException("refused: timed out", "TimeoutError"),
	},
];

test.each(failuresThatAreNotDeletes)(
	"$name is no deletion: the push fails as before and sends nothing",
	async ({ error }) => {
		const { ctx, bodies, deletions } = createBodyContext({ refusal: error });

		await expect(pushSubject({ ctx })).rejects.toBe(error);
		expect(bodies).toEqual([]);
		expect(deletions).toEqual([]);
	},
);
