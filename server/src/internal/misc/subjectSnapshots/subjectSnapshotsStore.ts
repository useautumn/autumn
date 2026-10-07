import {
	type SubjectSnapshotsEdgeConfig,
	subjectSnapshotsEdgeConfig,
} from "@autumn/edge-config";
import { createEdgeConfigStore } from "@/internal/misc/edgeConfig/edgeConfigStore.js";

/** Admin-only handle on the balance worker's record; the server never polls it. */
export const subjectSnapshotsStore =
	createEdgeConfigStore<SubjectSnapshotsEdgeConfig>({
		s3Key: subjectSnapshotsEdgeConfig.key,
		schema: subjectSnapshotsEdgeConfig.schema,
		defaultValue: subjectSnapshotsEdgeConfig.defaultValue,
	});
