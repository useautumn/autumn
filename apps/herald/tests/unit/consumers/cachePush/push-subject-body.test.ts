/**
 * Herald builds its subjects.set body through the shared builder the server's pull also uses: the same body as before,
 * except that log_offset is the offset the worker's read covers, with the record's offset when the worker names none.
 *
 *  2.1 the worker's logOffset is the body's; 2.2 without one, the record's; 2.4 an evict's version rides along;
 *  2.5 read_at is taken before the worker read; and the body and the read it sends are exactly herald's old ones.
 */

import { afterEach, beforeEach, expect, spyOn, test } from "bun:test";
import type { ReadSubjectStateCommand } from "@autumn/balance-engine";
import type { ReadSubjectStateReply } from "@autumn/balance-worker-client/protocol";
import { _resetOrgWithFeaturesL1ForTesting } from "@autumn/cache";
import { ShadowAtomConfigSchema } from "@autumn/edge-config";
import {
	AppEnv,
	ByocCacheStatus,
	type Organization,
	OrgConfigSchema,
} from "@autumn/shared";
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

/** org_1 with its own ready Atom, whose worker answers `reply` and moves the clock to 2 000 while it reads. */
const createBodyContext = ({
	reply,
}: {
	reply: Partial<ReadSubjectStateReply>;
}) => {
	const bodies: unknown[] = [];
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
		getAtomClient: () => ({
			setSubject: async ({ body }: { body: unknown }) => {
				bodies.push(body);
			},
			setCatalog: async () => undefined,
		}),
	} as unknown as CachePushContext;
	return { ctx, bodies, commands };
};

const pushSubject = ({
	ctx,
	customerVersion = null,
}: {
	ctx: CachePushContext;
	customerVersion?: bigint | null;
}) =>
	pushSubjectToCache({
		ctx,
		cacheSubject: {
			identity,
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
