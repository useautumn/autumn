import { ReplayOperatorError } from "@server/internal/balances/replay/operator/replayOperatorErrors.js";
import {
	REPLAY_STAGING_BROKERS,
	REPLAY_STAGING_DEPLOYMENT,
	REPLAY_STAGING_OWNERSHIP_TOPIC,
	REPLAY_STAGING_PARTITION_COUNT,
	REPLAY_STAGING_REGION,
} from "@server/internal/balances/replay/targets/replayStagingTargetContracts.js";

export const REPLAY_OPERATOR_DATABASE_URL_VARIABLE =
	"BALANCE_REPLAY_DATABASE_URL";

/** An operator manifest capped at 1000 requests never approaches this; the
 *  limit only stops the process from reading an unbounded file. */
const MAX_OPERATOR_FILE_BYTES = 10 * 1024 * 1024;

export function readReplayDatabaseUrl({
	runtimeEnv,
}: {
	runtimeEnv: Record<string, string | undefined>;
}): string {
	const databaseUrl =
		runtimeEnv[REPLAY_OPERATOR_DATABASE_URL_VARIABLE]?.trim() ?? "";
	if (databaseUrl.length === 0) {
		throw new ReplayOperatorError({
			message: `${REPLAY_OPERATOR_DATABASE_URL_VARIABLE} is required; the replay operator never falls back to DATABASE_URL`,
		});
	}
	return databaseUrl;
}

/** The deployment, topic, partition count and region are pinned constants: the
 *  command line cannot point the replay at another cluster. */
export function buildReplayStagingTargetInput({
	databaseUrl,
}: {
	databaseUrl: string;
}) {
	return {
		databaseUrl,
		brokers: [...REPLAY_STAGING_BROKERS],
		deployment: REPLAY_STAGING_DEPLOYMENT,
		topic: REPLAY_STAGING_OWNERSHIP_TOPIC,
		partitionCount: REPLAY_STAGING_PARTITION_COUNT,
		region: REPLAY_STAGING_REGION,
	};
}

function parseReplayOperatorJson({
	text,
	label,
}: {
	text: string;
	label: string;
}): unknown {
	try {
		return JSON.parse(text);
	} catch {
		throw new ReplayOperatorError({
			message: `the ${label} file is not valid JSON`,
		});
	}
}

export async function readReplayOperatorJsonFile({
	path,
	label,
}: {
	path: string;
	label: string;
}): Promise<unknown> {
	const file = Bun.file(path);
	if (!(await file.exists())) {
		throw new ReplayOperatorError({
			message: `the ${label} file does not exist`,
		});
	}
	if (file.size > MAX_OPERATOR_FILE_BYTES) {
		throw new ReplayOperatorError({
			message: `the ${label} file exceeds the ${MAX_OPERATOR_FILE_BYTES} byte operator limit`,
		});
	}
	return parseReplayOperatorJson({ text: await file.text(), label });
}
