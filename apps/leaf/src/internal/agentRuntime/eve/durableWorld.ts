import { logger } from "../../../lib/logger.js";
import { verifyNotifyDelivery } from "./verifyNotifyDelivery.js";

export type DurableWorld = {
	/** Every world query, the bouncer in prod. */
	queryUrl: string;
	/** The world's one LISTEN connection; a direct URL when one is configured. */
	listenUrl: string;
};

/** The chat database becomes eve's durable world only once NOTIFY through
 * `queryUrl` is proven to reach a LISTEN on `listenUrl`. */
export const selectDurableWorld = async ({
	chatDatabaseUrl,
	chatDatabaseDirectUrl,
	verify = verifyNotifyDelivery,
}: {
	chatDatabaseUrl: string | undefined;
	chatDatabaseDirectUrl: string | undefined;
	verify?: typeof verifyNotifyDelivery;
}): Promise<DurableWorld | undefined> => {
	if (!chatDatabaseUrl) {
		if (chatDatabaseDirectUrl) {
			logger.warn("CHAT_DATABASE_DIRECT_URL is set without CHAT_DATABASE_URL", {
				event: "leaf.eve_world_direct_url_unused",
			});
		}
		return undefined;
	}
	const world = {
		queryUrl: chatDatabaseUrl,
		listenUrl: chatDatabaseDirectUrl || chatDatabaseUrl,
	};
	const delivered = await verify({
		listenUrl: world.listenUrl,
		notifyUrl: world.queryUrl,
	});
	return delivered ? world : undefined;
};

/** eve derives its world from CHAT_DATABASE_URL, so an unproven world is
 * withheld from it entirely; the world module reads WORKFLOW_POSTGRES_URL. */
export const durableWorldEnv = ({
	env,
	world,
	workerConcurrency,
	maxPoolSize,
}: {
	env: NodeJS.ProcessEnv;
	world: DurableWorld | undefined;
	workerConcurrency: string;
	maxPoolSize: string;
}): NodeJS.ProcessEnv => {
	const {
		CHAT_DATABASE_URL: _chatDatabaseUrl,
		CHAT_DATABASE_DIRECT_URL: _chatDatabaseDirectUrl,
		...base
	} = env;
	if (!world) return base;
	return {
		WORKFLOW_POSTGRES_WORKER_CONCURRENCY: workerConcurrency,
		WORKFLOW_POSTGRES_MAX_POOL_SIZE: maxPoolSize,
		...base,
		CHAT_DATABASE_URL: world.queryUrl,
		WORKFLOW_POSTGRES_URL: world.queryUrl,
		CHAT_DATABASE_DIRECT_URL: world.listenUrl,
	};
};
