import { logger } from "../../../../lib/logger.js";
import { type WorkflowWorld, workflowWorld } from "./workflowWorld.js";

export const sessionStreamName = (sessionId: string) =>
	`${sessionId.replace(/^wrun_/, "strm_")}_user`;

export const resolveStreamName = async ({
	sessionId,
	world,
}: {
	sessionId: string;
	world: WorkflowWorld;
}) => {
	const expected = sessionStreamName(sessionId);
	const names = await world.streams.list(sessionId).catch((error: unknown) => {
		logger.warn("Could not list eve session streams", {
			event: "leaf.eve_stream_list_failed",
			data: { session_id: sessionId },
			error,
		});
		return [] as string[];
	});
	if (names.includes(expected) || names.length === 0) return expected;
	const userStream = names.find((name) => name.endsWith("_user"));
	if (userStream && userStream !== expected) {
		logger.warn("Eve session stream name differs from the expected form", {
			event: "leaf.eve_stream_name_mismatch",
			data: { expected, found: userStream, session_id: sessionId },
		});
	}
	return userStream ?? expected;
};

export const journaledEventCount = async ({
	sessionId,
	streamName,
	world,
}: {
	sessionId: string;
	streamName: string;
	world: WorkflowWorld;
}) => {
	const info = await world.streams.getInfo(sessionId, streamName);
	return info.tailIndex + 1;
};

/** Exact number of events eve has journaled for the session. */
export const sessionEventCount = async (
	sessionId: string,
): Promise<number | undefined> => {
	const world = workflowWorld();
	if (!world) return undefined;
	const streamName = await resolveStreamName({ sessionId, world });
	return journaledEventCount({ sessionId, streamName, world });
};
