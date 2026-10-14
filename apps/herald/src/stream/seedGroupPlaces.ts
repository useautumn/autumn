import type { AutumnLogger } from "@autumn/logging";
import type { Admin } from "kafkajs";

const NO_COMMITTED_OFFSET = "-1";

export type SeedGroupPlacesOutcome = "kept" | "seeded";

export async function seedGroupPlaces({
	ctx,
	groupId,
	topic,
}: {
	ctx: {
		admin: Pick<
			Admin,
			| "connect"
			| "disconnect"
			| "fetchOffsets"
			| "fetchTopicOffsets"
			| "setOffsets"
		>;
		logger: Pick<AutumnLogger, "info">;
	};
	groupId: string;
	topic: string;
}): Promise<SeedGroupPlacesOutcome> {
	const { admin } = ctx;
	await admin.connect();
	try {
		if (await hasAnyPlace({ admin, groupId, topic })) return "kept";
		const ends = await admin.fetchTopicOffsets(topic);
		const partitions = ends.map(({ partition, high }) => ({
			partition,
			offset: high,
		}));
		try {
			await admin.setOffsets({ groupId, topic, partitions });
		} catch (cause) {
			if (await hasAnyPlace({ admin, groupId, topic })) return "kept";
			throw cause;
		}
		ctx.logger.info(
			{ type: "herald_group_seeded", data: { groupId, topic } },
			"Herald job has no place in the log yet; starting at the end",
		);
		return "seeded";
	} finally {
		await admin.disconnect();
	}
}

async function hasAnyPlace({
	admin,
	groupId,
	topic,
}: {
	admin: Pick<Admin, "fetchOffsets">;
	groupId: string;
	topic: string;
}): Promise<boolean> {
	const committed = await admin.fetchOffsets({ groupId, topics: [topic] });
	for (const entry of committed) {
		for (const partition of entry.partitions) {
			if (partition.offset !== NO_COMMITTED_OFFSET) return true;
		}
	}
	return false;
}
