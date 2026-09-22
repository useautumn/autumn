import { expect, test } from "bun:test";
import { once } from "node:events";
import { createServer, type Socket } from "node:net";
import { Redis } from "ioredis";
import { createRedisPipeline } from "@/external/redis/utils/createRedisPipeline.js";

test("a pipeline can outlive the client timeout without extending concurrent commands", async () => {
	const sockets = new Set<Socket>();
	const timers = new Set<ReturnType<typeof setTimeout>>();
	const server = createServer((socket) => {
		sockets.add(socket);
		socket.on("close", () => sockets.delete(socket));
		let pending = "";
		socket.on("data", (chunk) => {
			pending += chunk.toString();
			// All requests in this test are GET slow, including coalesced or fragmented writes.
			const request = "*2\r\n$3\r\nget\r\n$4\r\nslow\r\n";
			while (pending.startsWith(request)) {
				pending = pending.slice(request.length);
				const timer = setTimeout(() => {
					timers.delete(timer);
					socket.write("$2\r\nOK\r\n");
				}, 1_200);
				timers.add(timer);
			}
		});
	});
	server.listen(0, "127.0.0.1");
	await once(server, "listening");
	const address = server.address();
	if (!address || typeof address === "string") throw new Error("Missing port");
	const redis = new Redis({
		host: "127.0.0.1",
		port: address.port,
		lazyConnect: true,
		enableReadyCheck: false,
		disableClientInfo: true,
		commandTimeout: 1_000,
		retryStrategy: () => null,
	});
	try {
		await redis.connect();
		const pipeline = createRedisPipeline({ redis, commandTimeoutMs: 10_000 });
		pipeline.get("slow");
		await Promise.all([
			expect(redis.get("slow")).rejects.toThrow("Command timed out"),
			expect(pipeline.exec()).resolves.toEqual([[null, "OK"]]),
		]);
		expect(redis.options.commandTimeout).toBe(1_000);
	} finally {
		redis.disconnect();
		for (const timer of timers) clearTimeout(timer);
		for (const socket of sockets) socket.destroy();
		await new Promise<void>((resolve, reject) => {
			server.close((error) => (error ? reject(error) : resolve()));
		});
	}
}, 5_000);
