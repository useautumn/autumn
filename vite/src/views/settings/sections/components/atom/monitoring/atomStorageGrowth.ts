import {
	type ApiAtomUpdate,
	type AtomVolume,
	BYOC_CACHE_REPLICAS,
} from "@autumn/shared";

const GIB_BYTES = 1024 ** 3;
/** A grown filesystem reports a little under its volume, after ext4's own reserve. */
const GROWN_SHARE = 0.9;
/** How long a finished grow stays on the card. */
const COMPLETE_SHOWN_MS = 10 * 60 * 1000;

export type AtomStorageGrowth =
	| {
			phase: "requested" | "growing" | "complete";
			targetGib: number;
			grownReplicas: number;
			at: number;
	  }
	| { phase: "failed"; targetGib: number; error: string | null; at: number };

/** Where a grow to `targetGib` stands, from alien's update and each replica's reported volume; null when none is worth showing. */
export const atomStorageGrowth = ({
	targetGib,
	volumes,
	update,
	now,
}: {
	targetGib: number;
	volumes: AtomVolume[];
	update: ApiAtomUpdate | null;
	now: number;
}): AtomStorageGrowth | null => {
	if (!update) return null;
	const at = update.completed_at ?? update.requested_at;
	if (update.status === "failed")
		return { phase: "failed", targetGib, error: update.error, at };
	const grownReplicas = volumes.filter(
		(volume) => volume.total_bytes >= targetGib * GIB_BYTES * GROWN_SHARE,
	).length;
	const progress = { targetGib, grownReplicas, at };
	// Every replica already reports the target, so any update still running is not this grow.
	const hasVolumes = volumes.length > 0;
	const isGrown = hasVolumes && grownReplicas >= BYOC_CACHE_REPLICAS;
	if (isGrown || (update.status === "succeeded" && !hasVolumes))
		return now - at < COMPLETE_SHOWN_MS
			? { phase: "complete", ...progress }
			: null;
	if (update.status === "requested") return { phase: "requested", ...progress };
	// Applying, or done in alien while the replicas still report the old size.
	return { phase: "growing", ...progress };
};

export const isAtomStorageGrowing = (growth: AtomStorageGrowth | null) =>
	growth?.phase === "requested" || growth?.phase === "growing";
