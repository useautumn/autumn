import { ms } from "@autumn/shared";
import postgres from "postgres";
import { logger } from "../../../../lib/logger.js";

const NOTIFY_TIMEOUT_MS = ms.seconds(3);

/** The workflow world streams over LISTEN/NOTIFY, which transaction poolers
 * (PlanetScale :6432, PgBouncer) silently drop; prove delivery before use. */
export const verifyNotifyDelivery = async ({
	connectionString,
}: {
	connectionString: string;
}): Promise<boolean> => {
	const channel = `leaf_notify_probe_${Date.now().toString(36)}`;
	const sql = postgres(connectionString, { max: 2, onnotice: () => undefined });
	try {
		const received = new Promise<boolean>((resolve) => {
			const timer = setTimeout(() => resolve(false), NOTIFY_TIMEOUT_MS);
			void sql
				.listen(channel, () => {
					clearTimeout(timer);
					resolve(true);
				})
				.then(() => sql.notify(channel, "probe"))
				.catch(() => {
					clearTimeout(timer);
					resolve(false);
				});
		});
		const delivered = await received;
		if (!delivered) {
			logger.error(
				"Postgres NOTIFY is not delivered on the chat database URL",
				{
					event: "leaf.eve_world_notify_unsupported",
					data: { host: new URL(connectionString).host },
				},
			);
		}
		return delivered;
	} catch (error) {
		logger.error("Could not probe NOTIFY delivery on the chat database URL", {
			event: "leaf.eve_world_notify_probe_failed",
			error,
		});
		return false;
	} finally {
		await sql.end({ timeout: 1 }).catch(() => undefined);
	}
};
