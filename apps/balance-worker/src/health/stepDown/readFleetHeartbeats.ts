import {
	SLOT_HEARTBEAT_KEY_PREFIX,
	type SlotHeartbeat,
	SlotHeartbeatSchema,
} from "../../blueGreen/types/slotHeartbeat.js";
import type { AdminBucketObjects } from "../../external/s3/types/adminBucketObjects.js";

export async function readFleetHeartbeats({
	ctx,
	fleetId,
	modifiedAfter,
}: {
	ctx: { objects: AdminBucketObjects };
	fleetId: string;
	modifiedAfter: number;
}): Promise<SlotHeartbeat[]> {
	const listed = await ctx.objects.list({
		prefix: `${SLOT_HEARTBEAT_KEY_PREFIX}/${fleetId}/`,
	});
	const recent = listed.filter(
		({ lastModifiedAt }) => lastModifiedAt > modifiedAfter,
	);
	const read = await Promise.all(
		recent.map(({ key }) => readHeartbeat({ ctx, key })),
	);
	return read.filter((heartbeat) => heartbeat !== null);
}

async function readHeartbeat({
	ctx,
	key,
}: {
	ctx: { objects: AdminBucketObjects };
	key: string;
}): Promise<SlotHeartbeat | null> {
	try {
		const object = await ctx.objects.read({ key });
		if (object === null) return null;
		return SlotHeartbeatSchema.safeParse(JSON.parse(object.text)).data ?? null;
	} catch {
		return null;
	}
}
