import { createServer, type Socket } from "node:net";

/** Just enough of the wire protocol for pg to connect and run simple queries: every query answers with no rows. */
export type FakePostgresServer = {
	url: string;
	/** Connections opened so far. */
	connections(): number;
	/** Every connection open now stops answering, the way a dead path to the bouncer looks; new ones answer. */
	silenceOpenConnections(): void;
	close(): Promise<void>;
};

const message = ({ type, body }: { type: string; body: Buffer }): Buffer => {
	const header = Buffer.alloc(5);
	header.write(type, 0);
	header.writeInt32BE(body.length + 4, 1);
	return Buffer.concat([header, body]);
};

const AUTHENTICATION_OK = message({ type: "R", body: Buffer.alloc(4) });
const READY_FOR_QUERY = message({ type: "Z", body: Buffer.from("I") });
const QUERY_COMPLETE = Buffer.concat([
	message({ type: "C", body: Buffer.from("SELECT 0\0") }),
	READY_FOR_QUERY,
]);

const serve = ({ socket, silent }: { socket: Socket; silent: Set<Socket> }) => {
	let buffered = Buffer.alloc(0);
	let started = false;
	socket.on("data", (chunk) => {
		buffered = Buffer.concat([buffered, chunk]);
		for (;;) {
			const headerLength = started ? 5 : 4;
			if (buffered.length < headerLength) return;
			const length = buffered.readInt32BE(headerLength - 4);
			const total = length + headerLength - 4;
			if (buffered.length < total) return;
			const type = started ? String.fromCharCode(buffered[0] ?? 0) : null;
			buffered = buffered.subarray(total);
			if (silent.has(socket)) continue;
			if (!started) {
				started = true;
				socket.write(Buffer.concat([AUTHENTICATION_OK, READY_FOR_QUERY]));
			} else if (type === "Q") socket.write(QUERY_COMPLETE);
			else if (type === "X") socket.end();
		}
	});
	socket.on("error", () => {});
};

export const startFakePostgresServer =
	async (): Promise<FakePostgresServer> => {
		const open = new Set<Socket>();
		const silent = new Set<Socket>();
		let connections = 0;
		const server = createServer((socket) => {
			connections++;
			open.add(socket);
			socket.on("close", () => open.delete(socket));
			serve({ socket, silent });
		});
		await new Promise<void>((resolve) =>
			server.listen(0, "127.0.0.1", resolve),
		);
		const address = server.address();
		if (!address || typeof address === "string")
			throw new Error("fake Postgres server has no port");

		return {
			url: `postgres://user:secret@127.0.0.1:${address.port}/db?sslmode=disable`,
			connections: () => connections,
			silenceOpenConnections: () => {
				for (const socket of open) silent.add(socket);
			},
			close: async () => {
				for (const socket of open) socket.destroy();
				await new Promise<void>((resolve) => server.close(() => resolve()));
			},
		};
	};
