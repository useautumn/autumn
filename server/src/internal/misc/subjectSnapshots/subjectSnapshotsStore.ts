import {
	type SubjectSnapshotsEdgeConfig,
	subjectSnapshotsEdgeConfig,
} from "@autumn/edge-config";
import { createEdgeConfigStore } from "@/internal/misc/edgeConfig/edgeConfigStore.js";

export const subjectSnapshotsStore =
	createEdgeConfigStore<SubjectSnapshotsEdgeConfig>({
		s3Key: subjectSnapshotsEdgeConfig.key,
		schema: subjectSnapshotsEdgeConfig.schema,
		defaultValue: subjectSnapshotsEdgeConfig.defaultValue,
	});
