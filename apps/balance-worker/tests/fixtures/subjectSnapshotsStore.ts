import {
	createEdgeConfigStore,
	defaultSubjectSnapshotsEdgeConfig,
	type EdgeConfigS3Client,
	type EdgeConfigStore,
	type SubjectSnapshotsEdgeConfig,
	subjectSnapshotsEdgeConfig,
} from "@autumn/edge-config";

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
