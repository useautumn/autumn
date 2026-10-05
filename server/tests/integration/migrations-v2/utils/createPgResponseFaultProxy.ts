import { createConnection, createServer, type Socket } from "node:net";

export const createPgResponseFaultProxy = async ({
	fixtureUrl,
	lostCommand,
}: {
	fixtureUrl: string;
	lostCommand?: string;
}) => {
	const target = new URL(fixtureUrl);
	if (target.hostname !== "127.0.0.1")
		throw new Error("Postgres fault proxy requires isolated loopback Postgres");
	const sockets = new Set<Socket>();
	let suppressedResponses = 0;
	let commits = 0;
	const server = createServer((downstream) => {
		const upstream = createConnection({
			host: "127.0.0.1",
			port: Number(target.port || 5432),
		});
		sockets.add(downstream);
		sockets.add(upstream);
		let pending = Buffer.alloc(0);
		let blackholed = false;
		downstream.pipe(upstream);
		upstream.on("data", (data: Buffer) => {
			pending = Buffer.concat([pending, data]);
			while (pending.length >= 5) {
				const length = pending.readInt32BE(1) + 1;
				if (pending.length < length) break;
				const frame = pending.subarray(0, length);
				pending = pending.subarray(length);
				if (frame[0] === 67) {
					const command = frame.subarray(5, -1).toString();
					if (command === "COMMIT") commits += 1;
					if (command === lostCommand && suppressedResponses === 0) {
						blackholed = true;
						suppressedResponses += 1;
					}
				}
				if (!blackholed) downstream.write(frame);
			}
		});
		for (const [socket, peer] of [
			[downstream, upstream],
			[upstream, downstream],
		]) {
			socket.on("error", () => peer.destroy());
			socket.on("close", () => {
				sockets.delete(socket);
				peer.destroy();
			});
		}
	});
	await new Promise<void>((resolve, reject) => {
		server.once("error", reject);
		server.listen(0, "127.0.0.1", resolve);
	});
	const address = server.address();
	if (!address || typeof address === "string")
		throw new Error("Postgres fault proxy did not bind a TCP port");
	target.port = String(address.port);
	const inspect = () => ({ commits, suppressedResponses });
	const close = async () => {
		for (const socket of sockets) socket.destroy();
		await new Promise<void>((resolve, reject) => {
			server.close((error) => (error ? reject(error) : resolve()));
		});
	};
	return { connectionString: target.toString(), inspect, close };
};
