import { expect, test } from "bun:test";
import { createBalanceWorkerEnv } from "@autumn/env/balanceWorker";
import { resolveWorkerAddress } from "../../../src/init/resolveWorkerAddress.js";
import { balanceWorkerEnvToRuntimeConfig } from "../../../src/init/workerConfig.js";

const localEnvironment = { KAFKA_BROKERS: "127.0.0.1:19092" };

test(
	"local workers derive their address without an endpoint override",
	localAddresses,
);
test(
	"ECS tasks publish their own address with a reachable listener",
	ecsAddresses,
);
test("ECS metadata failures never fall back to localhost", metadataFailures);

async function localAddresses(): Promise<void> {
	for (const host of ["127.0.0.1", "localhost", "::1"]) {
		const env = createBalanceWorkerEnv({
			...localEnvironment,
			BALANCE_WORKER_HOST: host,
			BALANCE_WORKER_PORT: "12982",
		});
		expect(await resolveWorkerAddress({ env })).toEqual({
			hostname: host,
			endpoint: `http://${host === "::1" ? "[::1]" : host}:12982`,
		});
	}
}

async function ecsAddresses(): Promise<void> {
	const responses: Record<string, Response> = {};
	for (const address of ["10.0.1.10", "10.0.2.20"]) {
		responses[`/${address}`] = Response.json({
			Networks: [{ NetworkMode: "awsvpc", IPv4Addresses: [address] }],
		});
	}
	const metadata = createMetadataServer(responses);
	try {
		for (const address of ["10.0.1.10", "10.0.2.20"]) {
			const env = createBalanceWorkerEnv({
				...localEnvironment,
				ECS_CONTAINER_METADATA_URI_V4: `${metadata.url}${address}`,
				BALANCE_WORKER_PORT: "12982",
				BALANCE_WORKER_ENDPOINT: "http://127.0.0.1:12982",
			});
			const resolved = await resolveWorkerAddress({ env });
			expect(resolved).toEqual({
				hostname: "0.0.0.0",
				endpoint: `http://${address}:12982`,
			});
			expect(
				balanceWorkerEnvToRuntimeConfig({ env, endpoint: resolved.endpoint })
					.ownership.endpoint,
			).toBe(`http://${address}:12982`);
		}
	} finally {
		await metadata.stop(true);
	}
}

async function metadataFailures(): Promise<void> {
	const metadata = createMetadataServer({
		"/unavailable": new Response("unavailable", { status: 503 }),
		"/missing": Response.json({}),
		"/bridge": Response.json({
			Networks: [{ NetworkMode: "bridge", IPv4Addresses: ["172.17.0.2"] }],
		}),
		"/no-ip": Response.json({
			Networks: [{ NetworkMode: "awsvpc", IPv4Addresses: [] }],
		}),
		"/malformed": new Response("not json"),
	});
	try {
		for (const path of [
			"unavailable",
			"missing",
			"bridge",
			"no-ip",
			"malformed",
		]) {
			const env = createBalanceWorkerEnv({
				...localEnvironment,
				ECS_CONTAINER_METADATA_URI_V4: `${metadata.url}${path}`,
			});
			await expect(resolveWorkerAddress({ env })).rejects.toThrow();
		}
	} finally {
		await metadata.stop(true);
	}
}

function createMetadataServer(responses: Record<string, Response>) {
	function respond(request: Request): Response {
		return (
			responses[new URL(request.url).pathname]?.clone() ??
			new Response(null, { status: 404 })
		);
	}
	return Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: respond });
}
