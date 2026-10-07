import {
	createEdgeConfigStore,
	type EdgeConfigS3Client,
	type EdgeConfigStore,
} from "@autumn/edge-config";
import {
	defaultSubjectSnapshotsEdgeConfig,
	type SubjectSnapshotsEdgeConfig,
	subjectSnapshotsEdgeConfig,
} from "../../src/edgeConfig/subjectSnapshotsEdgeConfig.js";

/** An S3 with one object per key, so a write lands where the next read looks. */
export const createMemoryS3Client = (): EdgeConfigS3Client => {
	const objects = new Map<string, string>();
	return {
		send: async (command) => {
			const { Key, Body } = command.input as { Key?: string; Body?: string };
			if (Body !== undefined) {
				objects.set(Key ?? "", Body);
				return {};
			}
			const stored = objects.get(Key ?? "");
			if (stored === undefined) {
				const missing = new Error("NoSuchKey");
				missing.name = "NoSuchKey";
				throw missing;
			}
			return { Body: { transformToString: async () => stored } };
		},
	};
};

/** The worker's snapshot settings store over an in-memory S3, serving `settings` until a test writes again. */
export const createSubjectSnapshotsStore = (
	settings: Partial<SubjectSnapshotsEdgeConfig> = {},
): EdgeConfigStore<SubjectSnapshotsEdgeConfig> => {
	const store = createEdgeConfigStore({
		ctx: {
			location: () => ({ bucket: "test", region: "us-east-2" }),
			s3Client: createMemoryS3Client(),
		},
		s3Key: subjectSnapshotsEdgeConfig.key,
		schema: subjectSnapshotsEdgeConfig.schema,
		defaultValue: subjectSnapshotsEdgeConfig.defaultValue,
	});
	store._setRuntimeConfigForTesting({
		...defaultSubjectSnapshotsEdgeConfig(),
		...settings,
	});
	return store;
};
