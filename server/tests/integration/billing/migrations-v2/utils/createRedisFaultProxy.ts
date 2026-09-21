import { once } from "node:events";
import { createConnection, createServer, type Socket } from "node:net";
import { Redis } from "ioredis";

/** Drop traffic on a private connection; shared test Redis stays healthy. */
export const createRedisFaultProxy = async ({ redis }: { redis: Redis }) => {
	const { host = "localhost", port = 6379 } = redis.options;
	if (!["localhost", "127.0.0.1", "::1"].includes(host)) {
		throw new Error("Redis fault reproduction requires worktree-local Redis");
	}
	let blocked = false;
	let droppedBytes = 0;
	const sockets = new Set<Socket>();
	const server = createServer((downstream) => {
		const upstream = createConnection({ host, port });
		for (const socket of [downstream, upstream]) {
			sockets.add(socket);
			socket.on("error", () => {
				downstream.destroy();
				upstream.destroy();
			});
			socket.on("close", () => {
				sockets.delete(socket);
				downstream.destroy();
				upstream.destroy();
			});
		}
		downstream.on("data", (chunk: Buffer) => {
			if (blocked) droppedBytes += chunk.length;
			else upstream.write(chunk);
		});
		upstream.pipe(downstream);
	});
	server.listen(0, "127.0.0.1");
	await once(server, "listening");
	const address = server.address();
	if (!address || typeof address === "string")
		throw new Error("Missing proxy port");
	const client = new Redis({
		...redis.options,
		host: "127.0.0.1",
		port: address.port,
		tls: undefined,
		lazyConnect: true,
		commandTimeout: 1_000,
		maxRetriesPerRequest: 0,
		autoResendUnfulfilledCommands: false,
	});
	await client.connect();
	await client.ping();
	const block = () => {
		blocked = true;
	};
	const recover = async () => {
		blocked = false;
		// Reset the stream so timed-out command replies cannot poison the retry.
		const ended = once(client, "end");
		client.disconnect();
		await ended;
		await client.connect();
		await client.ping();
	};
	const close = async () => {
		client.disconnect();
		for (const socket of sockets) socket.destroy();
		await new Promise<void>((resolve, reject) =>
			server.close((error) => (error ? reject(error) : resolve())),
		);
	};
	const getDroppedBytes = () => droppedBytes;
	return { client, block, recover, close, getDroppedBytes };
};
