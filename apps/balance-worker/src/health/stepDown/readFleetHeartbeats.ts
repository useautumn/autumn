import {
	SLOT_HEARTBEAT_KEY_PREFIX,
	type SlotHeartbeat,
	SlotHeartbeatSchema,
} from "../../blueGreen/types/slotHeartbeat.js";
import type { AdminBucketObjects } from "../../external/s3/types/adminBucketObjects.js";
import type { FleetListing, FleetRead } from "./types/fleetHeartbeats.js";

export async function readFleetHeartbeats({
	ctx,
	fleetId,
	since,
}: {
	ctx: { objects: AdminBucketObjects };
	fleetId: string;
	since: FleetListing | null;
}): Promise<FleetRead> {
	const listed = await ctx.objects.list({
		prefix: `${SLOT_HEARTBEAT_KEY_PREFIX}/${fleetId}/`,
	});
	const listing: FleetListing = new Map(
		listed.map(({ key, etag }) => [key, etag]),
	);
	if (since === null) return { listing, changed: [] };
	const written = listed.filter(({ key, etag }) => since.get(key) !== etag);
	const read = await Promise.all(
		written.map(({ key }) => readHeartbeat({ ctx, key })),
	);
	return {
		listing,
		changed: read.filter((heartbeat) => heartbeat !== null),
	};
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
