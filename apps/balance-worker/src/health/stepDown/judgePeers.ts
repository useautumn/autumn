import type { SlotHeartbeat } from "../../blueGreen/types/slotHeartbeat.js";
import type { PeerVerdict } from "./types/peerVerdict.js";

export function judgePeers({
	heartbeats,
	unreadable,
	selfEndpoint,
	faultAt,
	now,
	membershipMs,
	skewMs,
	minPeers,
}: {
	heartbeats: readonly SlotHeartbeat[];
	unreadable: number;
	selfEndpoint: string;
	faultAt: number;
	now: number;
	membershipMs: number;
	skewMs: number;
	minPeers: number;
}): PeerVerdict {
	const members = [...latestByEndpoint({ heartbeats }).values()].filter(
		(heartbeat) =>
			heartbeat.endpoint !== selfEndpoint &&
			!heartbeat.work?.steppedDown &&
			Date.parse(heartbeat.writtenAt) >= now - membershipMs,
	);
	const healthy = members.filter((heartbeat) =>
		vouchesSince({ heartbeat, after: faultAt + skewMs, until: now + skewMs }),
	).length;
	const live = members.length + unreadable;
	return {
		ok: healthy >= minPeers && healthy * 2 >= live,
		live,
		healthy,
	};
}

function latestByEndpoint({
	heartbeats,
}: {
	heartbeats: readonly SlotHeartbeat[];
}): Map<string, SlotHeartbeat> {
	const latest = new Map<string, SlotHeartbeat>();
	for (const heartbeat of heartbeats) {
		const known = latest.get(heartbeat.endpoint);
		if (!known || Date.parse(heartbeat.writtenAt) > Date.parse(known.writtenAt))
			latest.set(heartbeat.endpoint, heartbeat);
	}
	return latest;
}

function vouchesSince({
	heartbeat,
	after,
	until,
}: {
	heartbeat: SlotHeartbeat;
	after: number;
	until: number;
}): boolean {
	const { work } = heartbeat;
	if (!work || work.ownNetwork === "degraded" || work.lastSendAckAt === null)
		return false;
	return [heartbeat.writtenAt, work.lastSendAckAt].every((stamp) => {
		const at = Date.parse(stamp);
		return at > after && at <= until;
	});
}
