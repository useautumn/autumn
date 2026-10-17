import type { SlotHeartbeat } from "../../blueGreen/types/slotHeartbeat.js";
import type { PeerVerdict } from "./types/peerVerdict.js";

export function judgePeers({
	heartbeats,
	selfEndpoint,
	partitionCount,
	ackAgeLimitMs,
	minPeers,
}: {
	heartbeats: readonly SlotHeartbeat[];
	selfEndpoint: string;
	partitionCount: number;
	ackAgeLimitMs: number;
	minPeers: number;
}): PeerVerdict {
	const vouching = heartbeats.filter(
		(heartbeat) =>
			heartbeat.endpoint !== selfEndpoint &&
			vouchesForItsWork({ heartbeat, ackAgeLimitMs }),
	);
	const peers = new Set(vouching.map(({ endpoint }) => endpoint));
	const partitions = new Set(
		vouching.flatMap(({ partitions }) =>
			partitions.byPartition.map(({ partition }) => partition),
		),
	);
	return {
		ok: peers.size >= minPeers && partitions.size * 2 >= partitionCount,
		vouching: peers.size,
		partitions: partitions.size,
		partitionCount,
	};
}

function vouchesForItsWork({
	heartbeat,
	ackAgeLimitMs,
}: {
	heartbeat: SlotHeartbeat;
	ackAgeLimitMs: number;
}): boolean {
	const { work } = heartbeat;
	return (
		work !== undefined &&
		!work.steppedDown &&
		work.ownNetwork !== "degraded" &&
		work.lastSendAckAgeMs !== null &&
		work.lastSendAckAgeMs <= ackAgeLimitMs
	);
}
