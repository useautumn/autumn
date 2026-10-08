import { describe, expect, test } from "bun:test";
import { startWorkerThreads } from "../../../src/init/construction/startWorkerThreads.js";

const logger = { warn() {}, error() {} };

async function freePort(): Promise<number> {
	const reservation = Bun.serve({
		port: 0,
		hostname: "127.0.0.1",
		fetch: () => new Response(),
	});
	const port = reservation.port;
	await reservation.stop(true);
	if (port === undefined) throw new Error("no port");
	return port;
}

function configFor({ port }: { port: number }) {
	return {
		http: {
			hostname: "127.0.0.1",
			port,
			maxRequestBodySize: 1 << 20,
			threads: 1,
			requestRingBytes: 1 << 16,
			replyRingBytes: 1 << 16,
		},
	};
}

function ctxFor({ fatal }: { fatal: string[] }) {
	return {
		fetch: async () => new Response("ok"),
		logger,
		onFatal: ({ scope }: { scope: string }) => fatal.push(scope),
	};
}

describe("starting worker threads", () => {
	test("requests are served on the HTTP threads and stopping frees the port", async () => {
		const port = await freePort();
		const fatal: string[] = [];
		const { listener } = await startWorkerThreads({
			ctx: ctxFor({ fatal }),
			config: configFor({ port }),
		});
		try {
			const response = await fetch(`http://127.0.0.1:${port}/health`);
			expect(await response.text()).toBe("ok");
		} finally {
			await listener.stop();
		}
		expect(fatal).toEqual([]);
		const rebound = Bun.serve({
			port,
			hostname: "127.0.0.1",
			fetch: () => new Response(),
		});
		await rebound.stop(true);
	});
});
