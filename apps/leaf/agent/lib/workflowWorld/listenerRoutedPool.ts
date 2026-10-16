import pg from "pg";

/** A pg Pool whose clients run on `queryUrl` while `pool.options` names `listenUrl`.
 * world-postgres opens its LISTEN client as `new Client(pool.options)`; pg-pool builds its own clients from `options.Client`. */
export const createListenerRoutedPool = ({
	queryUrl,
	listenUrl,
	max,
}: {
	queryUrl: string;
	listenUrl: string;
	max?: number;
}) => {
	class QueryClient extends pg.Client {
		constructor(config?: pg.ClientConfig) {
			super({ ...config, connectionString: queryUrl });
		}
	}
	return new pg.Pool({
		connectionString: listenUrl,
		keepAlive: true,
		Client: QueryClient as new () => pg.ClientBase,
		...(max === undefined ? {} : { max }),
	});
};
