import type { AppEnv } from "@autumn/shared";

const ASYNC_TRACK_SHARD_COUNT = 8n;

export const getAsyncTrackMessageGroupId = ({
	orgId,
	env,
	customerId,
	entityId,
	messageDeduplicationId,
}: {
	orgId: string;
	env: AppEnv;
	customerId: string;
	entityId?: string;
	messageDeduplicationId: string;
}) => {
	const shard =
		BigInt(Bun.hash(messageDeduplicationId)) % ASYNC_TRACK_SHARD_COUNT;

	return `${orgId}:${env}:${customerId}:${entityId ?? "none"}:shard-${shard}`;
};
