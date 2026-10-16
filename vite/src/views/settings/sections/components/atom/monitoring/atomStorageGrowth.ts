import {
	type ApiAtomUpdate,
	type AtomVolume,
	BYOC_CACHE_REPLICAS,
} from "@autumn/shared";

const GIB_BYTES = 1024 ** 3;
/** A grown filesystem reports a little under its volume, after ext4's own reserve. */
const GROWN_SHARE = 0.9;

export type AtomStorageGrowth =
	| {
			phase: "requested" | "growing";
			targetGib: number;
			grownReplicas: number;
			at: number;
	  }
	| { phase: "failed"; targetGib: number; error: string | null; at: number };

/** A grow to `targetGib` alien is running or failed; null once it succeeds, or when no replica reports a smaller volume. */
export const atomStorageGrowth = ({
	targetGib,
	volumes,
	update,
}: {
	targetGib: number;
	volumes: AtomVolume[];
	update: ApiAtomUpdate | null;
}): AtomStorageGrowth | null => {
	if (!update || update.status === "succeeded") return null;
	const grownReplicas = volumes.filter(
		(volume) => volume.total_bytes >= targetGib * GIB_BYTES * GROWN_SHARE,
	).length;
	// With no replica below the target there is nothing to grow, so the update is something else.
	if (grownReplicas === volumes.length) return null;
	if (update.status === "failed")
		return {
			phase: "failed",
			targetGib,
			error: update.error,
			at: update.completed_at ?? update.requested_at,
		};
	return {
		phase: update.status === "requested" ? "requested" : "growing",
		targetGib,
		grownReplicas: Math.min(grownReplicas, BYOC_CACHE_REPLICAS),
		at: update.requested_at,
	};
};

export const isAtomStorageGrowing = (growth: AtomStorageGrowth | null) =>
	growth?.phase === "requested" || growth?.phase === "growing";
