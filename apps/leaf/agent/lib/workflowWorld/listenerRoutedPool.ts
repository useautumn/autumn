import net from "node:net";
import pg from "pg";

/** A pg Pool whose clients run on `queryUrl` while `pool.options` names `listenUrl`.
 * world-postgres opens its LISTEN client as `new Client(pool.options)`; pg-pool builds its own clients from `options.Client`. */
export const createListenerRoutedPool = ({
	queryUrl,
	listenUrl,
	max,
	onListenerClosed,
}: {
	queryUrl: string;
	listenUrl: string;
	max?: number;
	onListenerClosed: () => void;
}) => {
	class QueryClient extends pg.Client {
		constructor(config?: pg.ClientConfig) {
			super({ ...config, connectionString: queryUrl, stream: undefined });
		}
	}
	return new pg.Pool({
		connectionString: listenUrl,
		keepAlive: true,
		// Only clients built from raw pool.options, i.e. the listener, get this watched socket.
		stream: () => {
			const socket = new net.Socket();
			socket.once("close", onListenerClosed);
			return socket;
		},
		Client: QueryClient as new () => pg.ClientBase,
		...(max === undefined ? {} : { max }),
	});
};
