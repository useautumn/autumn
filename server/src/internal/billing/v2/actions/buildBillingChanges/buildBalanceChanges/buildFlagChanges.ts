import type { ApiFlagV0, PreviewFlagChange } from "@autumn/shared";

export const buildFlagChanges = ({
	beforeFlags,
	afterFlags,
}: {
	beforeFlags: Record<string, ApiFlagV0>;
	afterFlags: Record<string, ApiFlagV0>;
}): PreviewFlagChange[] => [
	...Object.keys(afterFlags)
		.filter((featureId) => !beforeFlags[featureId])
		.map((featureId) => ({
			action: "created" as const,
			feature_id: featureId,
		})),
	...Object.keys(beforeFlags)
		.filter((featureId) => !afterFlags[featureId])
		.map((featureId) => ({
			action: "deleted" as const,
			feature_id: featureId,
		})),
];
