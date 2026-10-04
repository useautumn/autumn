import { describe, expect, test } from "bun:test";
import { listenThroughThreads } from "../../../src/init/construction/listenThroughThreads.js";

const logger = { warn() {}, error() {} };
const threadUrl = new URL(
	"../kafka/producerThread/fakeProducerThread.ts",
	import.meta.url,
).href;

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

function configFor({ port, clientId }: { port: number; clientId: string }) {
	return {
		http: {
			hostname: "127.0.0.1",
			port,
			maxRequestBodySize: 1 << 20,
			threads: 1,
			requestRingBytes: 1 << 16,
			replyRingBytes: 1 << 16,
		},
		producers: {
			clientId,
			brokers: ["fake:9092"],
			authMode: "none" as const,
			limits: {
				connectionTimeoutMs: 1000,
				requestTimeoutMs: 1000,
				retryCount: 1,
				initialRetryTimeMs: 1,
				maxRetryTimeMs: 1,
			},
			sendRingBytes: 1 << 16,
			ackRingBytes: 1 << 16,
			threadUrl,
		},
	};
}

function ctxFor({ fatal }: { fatal: string[] }) {
	return {
		fetch: async () => new Response("ok"),
		logger,
		onFatal: ({ scope }: { scope: string }) => fatal.push(scope),
		onToken() {},
	};
}

describe("listening through threads", () => {
	test("requests are served on the HTTP threads and partition producers live on the producer thread", async () => {
		const port = await freePort();
		const fatal: string[] = [];
		const { listener, producers } = await listenThroughThreads({
			ctx: ctxFor({ fatal }),
			config: configFor({ port, clientId: "test-client" }),
		});
		try {
			const response = await fetch(`http://127.0.0.1:${port}/health`);
			expect(await response.text()).toBe("ok");
			const producer = producers.producer({ idempotent: true });
			await producer.connect();
			const metadata = await producer.send?.({
				topic: "outcomes",
				messages: [{ key: "k", value: "v", partition: 3 }],
			});
			expect(metadata?.[0]).toMatchObject({ partition: 3, baseOffset: "0" });
			await producer.disconnect();
		} finally {
			await listener.stop();
		}
		expect(fatal).toEqual([]);
	});

	test("a producer thread that cannot start takes the HTTP threads down, so the port is free again", async () => {
		const port = await freePort();
		const caught = await listenThroughThreads({
			ctx: ctxFor({ fatal: [] }),
			config: configFor({ port, clientId: "bad-client" }),
		}).catch((cause: Error) => cause);
		expect((caught as Error).message).toContain("bad client id");
		const rebound = Bun.serve({
			port,
			hostname: "127.0.0.1",
			fetch: () => new Response(),
		});
		await rebound.stop(true);
	});
});
