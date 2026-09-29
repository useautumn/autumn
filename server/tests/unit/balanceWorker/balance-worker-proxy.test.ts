import { expect, test } from "bun:test";
import type { EvictCommand } from "@autumn/balance-engine";
import {
	BALANCE_WORKER_PROXY_SIGNATURE_HEADER,
	BalanceWorkerClientError,
	createBalanceWorkerClient,
	createProxyBalanceWorkerClient,
	type HttpClient,
	type HttpRequest,
	type HttpResponse,
	signProxyBody,
} from "@autumn/balance-worker-client";
import type { CommandAppend } from "@autumn/kafka";
import { meteringIdentityToPartition } from "@autumn/kafka/partitioning";
import {
	type ProxyReceiverContext,
	receiveProxyRequest,
} from "@/internal/balanceWorker/proxy/receiveProxyRequest/receiveProxyRequest.js";

const API_PARTITION_COUNT = 64;
const SECRET = "secret-current";
const silentLogger = { info() {}, warn() {}, error() {} };

const command: EvictCommand = {
	schemaVersion: 1,
	type: "evict",
	requestId: "request",
	identity: {
		orgId: "org",
		env: "sandbox",
		customerId: "customer",
		entityId: null,
	},
	occurredAt: 0,
};

/** The API's direct client over fakes: a worker that answers `workerResponse`, a command log, a catalog publisher. */
function createApi({
	workerResponse = { status: 200, body: { evicted: true } },
}: {
	workerResponse?: HttpResponse;
} = {}) {
	const workerRequests: HttpRequest[] = [];
	const appends: CommandAppend[] = [];
	const invalidations: { orgId: string; env: string }[] = [];
	const client = createBalanceWorkerClient({
		ctx: {
			owners: {
				findOwner: ({ partition }) => ({
					partition,
					routeEpoch: "1",
					endpoint: "http://worker",
				}),
				refresh: async () => {},
			},
			http: {
				postJson: async (request) => {
					workerRequests.push(request);
					return workerResponse;
				},
			},
			commandLog: {
				append: async (append) => {
					appends.push(append);
				},
			},
			catalogInvalidations: {
				invalidateOrgCatalog: async ({ orgId, env }) => {
					invalidations.push({ orgId, env });
				},
			},
		},
		config: { partitionCount: API_PARTITION_COUNT, timeoutMs: 1_000 },
	});
	const receiver: ProxyReceiverContext = {
		client,
		secret: SECRET,
		logger: silentLogger,
	};
	return { receiver, workerRequests, appends, invalidations };
}

/** Delivers the proxy client's POST to the receiver, through JSON as the wire would. */
function httpThroughReceiver({
	receiver,
}: {
	receiver: ProxyReceiverContext;
}): HttpClient {
	return {
		async postJson(request) {
			const response = await receiveProxyRequest({
				ctx: receiver,
				rawBody: JSON.stringify(request.body),
				signature:
					request.headers?.[BALANCE_WORKER_PROXY_SIGNATURE_HEADER] ?? null,
			});
			return {
				status: response.status,
				body: JSON.parse(JSON.stringify(response.body)),
			};
		},
	};
}

function createProxyClient({
	receiver,
	secret = SECRET,
}: {
	receiver: ProxyReceiverContext;
	secret?: string;
}) {
	return createProxyBalanceWorkerClient({
		ctx: { http: httpThroughReceiver({ receiver }) },
		config: { url: "https://api.test", secret, caller: "trigger" },
	});
}

test("a proxied evict reaches the owner through the API's client and returns the worker's reply", async () => {
	const api = createApi();
	const reply = await createProxyClient(api).evict({ command });
	expect(reply).toEqual({ evicted: true });
	expect(api.workerRequests).toHaveLength(1);
	expect(api.workerRequests[0]?.body).toMatchObject({ command });
});

test("a proxied queued evict lands on the partition the API's client picks", async () => {
	const api = createApi();
	await createProxyClient(api).queue.evict({ commands: [command] });
	expect(api.appends).toEqual([
		{
			records: [
				{
					partition: meteringIdentityToPartition({
						identity: command.identity,
						partitionCount: API_PARTITION_COUNT,
					}),
					command,
				},
			],
		},
	]);
});

test("a proxied catalog invalidation reaches the API's publisher", async () => {
	const api = createApi();
	await createProxyClient(api).catalog.invalidateOrgCatalog({
		orgId: "org",
		env: "sandbox",
	});
	expect(api.invalidations).toEqual([{ orgId: "org", env: "sandbox" }]);
});

test("a worker error comes back as the same client error, so callers' fallbacks still match it", async () => {
	const api = createApi({
		workerResponse: {
			status: 409,
			body: { error: { code: "STALE_SUBJECT", message: "stale" } },
		},
	});
	const error = await createProxyClient(api)
		.evict({ command })
		.catch((caught: unknown) => caught);
	expect(error).toBeInstanceOf(BalanceWorkerClientError);
	expect(error).toMatchObject({
		code: "WORKER_ERROR",
		outcome: "not_submitted",
		workerCode: "STALE_SUBJECT",
	});
});

test("a call signed with an unknown secret is rejected before the API's client runs it", async () => {
	const api = createApi();
	const error = await createProxyClient({ ...api, secret: "secret-wrong" })
		.evict({ command })
		.catch((caught: unknown) => caught);
	expect(error).toMatchObject({
		code: "PROXY_REJECTED",
		outcome: "not_submitted",
	});
	expect(api.workerRequests).toHaveLength(0);
});

/** Hands the receiver a body signed with the right secret, bypassing the proxy client's own checks. */
function receiveSigned({
	api,
	body,
}: {
	api: ReturnType<typeof createApi>;
	body: Record<string, unknown>;
}) {
	const rawBody = JSON.stringify(body);
	return receiveProxyRequest({
		ctx: api.receiver,
		rawBody,
		signature: signProxyBody({ secret: SECRET, rawBody }),
	});
}

test("a validly signed request sent outside the clock window is refused", async () => {
	const api = createApi();
	const response = await receiveSigned({
		api,
		body: {
			method: "evict",
			params: { command },
			caller: "trigger",
			sentAt: Date.now() - 5 * 60_000,
		},
	});
	expect(response.status).toBe(400);
	expect(api.workerRequests).toHaveLength(0);
});

test("a malformed command is refused before the API's client runs it", async () => {
	const api = createApi();
	const response = await receiveSigned({
		api,
		body: {
			method: "evict",
			params: { command: { ...command, identity: null } },
			caller: "trigger",
			sentAt: Date.now(),
		},
	});
	expect(response).toMatchObject({
		status: 400,
		body: { error: { code: "PROXY_REJECTED" } },
	});
	expect(api.workerRequests).toHaveLength(0);
});
