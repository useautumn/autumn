import { ms } from "@autumn/shared";
import postgres from "postgres";
import { logger } from "../../../lib/logger.js";

const NOTIFY_TIMEOUT_MS = ms.seconds(3);

const hostOf = (url: string) => {
	try {
		return new URL(url).host;
	} catch {
		return "unparseable";
	}
};

/** The workflow world LISTENs on `listenUrl` and NOTIFYs through `notifyUrl`; transaction
 * poolers (PlanetScale :6432, PgBouncer) silently drop LISTEN, so prove that exact path. */
export const verifyNotifyDelivery = async ({
	listenUrl,
	notifyUrl,
}: {
	listenUrl: string;
	notifyUrl: string;
}): Promise<boolean> => {
	const channel = `leaf_notify_probe_${Date.now().toString(36)}`;
	const hosts = {
		listen_host: hostOf(listenUrl),
		notify_host: hostOf(notifyUrl),
	};
	const listenSql = postgres(listenUrl, { max: 1, onnotice: () => undefined });
	const notifySql = postgres(notifyUrl, {
		max: 1,
		onnotice: () => undefined,
		prepare: false,
	});
	try {
		const delivered = await new Promise<boolean>((resolve) => {
			const timer = setTimeout(() => resolve(false), NOTIFY_TIMEOUT_MS);
			void listenSql
				.listen(channel, () => {
					clearTimeout(timer);
					resolve(true);
				})
				.then(() => notifySql.notify(channel, "probe"))
				.catch(() => {
					clearTimeout(timer);
					resolve(false);
				});
		});
		if (!delivered) {
			logger.error("Postgres NOTIFY is not delivered to the world's listener", {
				event: "leaf.eve_world_notify_unsupported",
				data: hosts,
			});
		}
		return delivered;
	} catch (error) {
		logger.error("Could not probe NOTIFY delivery for the workflow world", {
			event: "leaf.eve_world_notify_probe_failed",
			data: hosts,
			error,
		});
		return false;
	} finally {
		await Promise.all([
			listenSql.end({ timeout: 1 }).catch(() => undefined),
			notifySql.end({ timeout: 1 }).catch(() => undefined),
		]);
	}
};
