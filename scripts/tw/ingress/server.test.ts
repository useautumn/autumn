import { afterAll, beforeAll, expect, test } from "bun:test";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { server } from "./server.mjs";

const listen = async (target: Server) => {
	await new Promise<void>((resolve, reject) => {
		target.once("error", reject);
		target.listen(0, "127.0.0.1", () => {
			target.off("error", reject);
			resolve();
		});
	});
	return `http://127.0.0.1:${(target.address() as AddressInfo).port}`;
};

const close = async (target: Server) => {
	target.closeAllConnections();
	await new Promise<void>((resolve) => target.close(() => resolve()));
};

let ingressUrl: string;

beforeAll(async () => {
	ingressUrl = await listen(server);
});

afterAll(async () => {
	await close(server);
});

test("health check remains successful", async () => {
	const response = await fetch(`${ingressUrl}/health`);
	expect(response.status).toBe(200);
	expect(await response.text()).toBe("ok");
});

const mapWorker = async ({
	workerUrl,
	accountId = "acct_relay_test",
}: {
	workerUrl: string;
	accountId?: string;
}) => {
	const response = await fetch(`${ingressUrl}/ingress/map`, {
		method: "POST",
		headers: {
			"content-type": "application/json",
			"x-ingress-token": process.env.INGRESS_TOKEN ?? "",
		},
		body: JSON.stringify({ accountId, workerUrl }),
	});
	expect(response.status).toBe(200);
	await response.text();
};

const postEvent = ({ accountId = "acct_relay_test" } = {}) =>
	fetch(`${ingressUrl}/ingress/connect/sandbox`, {
		method: "POST",
		body: JSON.stringify({
			id: "evt_relay_test",
			account: accountId,
			type: "customer.subscription.updated",
			data: { object: { id: "sub_relay_test" } },
		}),
	});

test("worker failure is not acknowledged as successful delivery", async () => {
	const worker = createServer((_request, response) => {
		response.writeHead(503);
		response.end("temporarily unavailable");
	});
	try {
		await mapWorker({ workerUrl: await listen(worker) });
		const response = await postEvent();
		expect(response.status).toBe(503);
		await response.text();
	} finally {
		await close(worker);
	}
});

test("connection failure is not acknowledged as successful delivery", async () => {
	const worker = createServer((request) => request.socket.destroy());
	try {
		await mapWorker({ workerUrl: await listen(worker) });
		const response = await postEvent();
		expect(response.status).toBe(502);
		await response.text();
	} finally {
		await close(worker);
	}
});

test("a failed event can be delivered again without changing its payload", async () => {
	const requests: Array<{ path: string | undefined; body: string }> = [];
	const worker = createServer(async (request, response) => {
		const chunks = [];
		for await (const chunk of request) chunks.push(chunk);
		requests.push({
			path: request.url,
			body: Buffer.concat(chunks).toString(),
		});
		response.writeHead(requests.length === 1 ? 503 : 200);
		response.end();
	});
	try {
		await mapWorker({ workerUrl: await listen(worker) });
		const first = await postEvent();
		expect(first.status).toBe(503);
		await first.text();
		const retry = await postEvent();
		expect(retry.status).toBe(200);
		await retry.text();
		expect(requests).toHaveLength(2);
		expect(requests[0]).toEqual(requests[1]);
		expect(requests[1]?.path).toBe("/webhooks/connect/sandbox");
		expect(JSON.parse(requests[1]?.body ?? "{}").id).toBe("evt_relay_test");
	} finally {
		await close(worker);
	}
});

test("a blocked worker does not block delivery to another worker", async () => {
	const received = Promise.withResolvers<void>();
	const release = Promise.withResolvers<void>();
	const blocked = createServer(async (_request, response) => {
		received.resolve();
		await release.promise;
		response.writeHead(503);
		response.end();
	});
	const healthy = createServer((_request, response) => response.end("ok"));
	let pending: Promise<Response> | undefined;
	try {
		await mapWorker({
			workerUrl: await listen(blocked),
			accountId: "acct_blocked",
		});
		await mapWorker({
			workerUrl: await listen(healthy),
			accountId: "acct_healthy",
		});
		pending = postEvent({ accountId: "acct_blocked" });
		await received.promise;
		const response = await postEvent({ accountId: "acct_healthy" });
		expect(response.status).toBe(200);
		await response.text();
		release.resolve();
		const failure = await pending;
		expect(failure.status).toBe(503);
		await failure.text();
	} finally {
		release.resolve();
		await pending?.catch(() => undefined);
		await close(blocked);
		await close(healthy);
	}
}, 5000);

test("unmapped accounts remain ignored", async () => {
	const response = await postEvent({ accountId: "acct_unmapped" });
	expect(response.status).toBe(200);
	await response.text();
});

const mapSubAccount = ({
	accountId,
	workerAccountId,
}: {
	accountId: string;
	workerAccountId: string;
}) =>
	fetch(`${ingressUrl}/ingress/map`, {
		method: "POST",
		headers: {
			"content-type": "application/json",
			"x-ingress-token": process.env.INGRESS_TOKEN ?? "",
		},
		body: JSON.stringify({ accountId, workerAccountId }),
	});

test("sub-organization events reach only their owning worker and preserve its status", async () => {
	let receivedAccount: string | undefined;
	const worker = createServer(async (request, response) => {
		const chunks = [];
		for await (const chunk of request) chunks.push(chunk);
		receivedAccount = JSON.parse(Buffer.concat(chunks).toString()).account;
		response.writeHead(503);
		response.end();
	});
	try {
		await mapWorker({
			workerUrl: await listen(worker),
			accountId: "acct_parent",
		});
		for (let attempt = 0; attempt < 2; attempt++) {
			const registration = await mapSubAccount({
				accountId: "acct_sub_org",
				workerAccountId: "acct_parent",
			});
			expect(registration.status).toBe(200);
			await registration.text();
		}
		const delivered = await postEvent({ accountId: "acct_sub_org" });
		expect(delivered.status).toBe(503);
		await delivered.text();
		expect(receivedAccount).toBe("acct_sub_org");
	} finally {
		await close(worker);
	}
});

test("an unknown worker cannot register a sub-organization account", async () => {
	const response = await mapSubAccount({
		accountId: "acct_unknown_child",
		workerAccountId: "acct_unknown_parent",
	});
	expect(response.status).toBe(400);
	await response.text();
});

test("a sub-organization account cannot be reassigned to another worker", async () => {
	await mapWorker({
		workerUrl: "http://127.0.0.1:1",
		accountId: "acct_owner_a",
	});
	await mapWorker({
		workerUrl: "http://127.0.0.1:2",
		accountId: "acct_owner_b",
	});
	const registered = await mapSubAccount({
		accountId: "acct_owned_child",
		workerAccountId: "acct_owner_a",
	});
	expect(registered.status).toBe(200);
	await registered.text();
	const rejected = await mapSubAccount({
		accountId: "acct_owned_child",
		workerAccountId: "acct_owner_b",
	});
	expect(rejected.status).toBe(409);
	await rejected.text();
});

test("invalid event payload is rejected", async () => {
	const response = await fetch(`${ingressUrl}/ingress/connect/sandbox`, {
		method: "POST",
		body: "invalid json",
	});
	expect(response.status).toBe(400);
	await response.text();
});
