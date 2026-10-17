import type { SlotHeartbeat } from "../../blueGreen/types/slotHeartbeat.js";
import type { PeerVerdict } from "./types/peerVerdict.js";

export function judgePeers({
	heartbeats,
	selfEndpoint,
	faultAt,
	now,
	liveMs,
	minPeers,
}: {
	heartbeats: readonly SlotHeartbeat[];
	selfEndpoint: string;
	faultAt: number;
	now: number;
	liveMs: number;
	minPeers: number;
}): PeerVerdict {
	const live = heartbeats.filter(
		(heartbeat) =>
			heartbeat.endpoint !== selfEndpoint &&
			!heartbeat.work?.steppedDown &&
			Date.parse(heartbeat.writtenAt) >= now - liveMs,
	);
	const healthy = live.filter((heartbeat) =>
		vouchesSince({ heartbeat, faultAt }),
	).length;
	return {
		ok: healthy >= minPeers && healthy * 2 >= live.length,
		live: live.length,
		healthy,
	};
}

function vouchesSince({
	heartbeat,
	faultAt,
}: {
	heartbeat: SlotHeartbeat;
	faultAt: number;
}): boolean {
	const { work } = heartbeat;
	if (!work || work.ownNetwork === "degraded" || work.lastSendAckAt === null)
		return false;
	return (
		Date.parse(heartbeat.writtenAt) > faultAt &&
		Date.parse(work.lastSendAckAt) > faultAt
	);
}
