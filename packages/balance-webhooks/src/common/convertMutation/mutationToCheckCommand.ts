import type {
	CheckCommand,
	SubjectStateMutation,
} from "@autumn/balance-engine";
import type { Feature } from "@autumn/shared";

const A_HAIR_ABOVE_ZERO = 0.0000001;

export const mutationToTrackedFeature = ({
	mutation,
}: {
	mutation: SubjectStateMutation;
}): { featureId: string; properties: CheckCommand["properties"] } | null => {
	const { command } = mutation;
	if (command.type === "track") {
		return { featureId: command.featureId, properties: command.properties };
	}
	if (command.type === "finalize") {
		return {
			featureId: command.lock.feature_id,
			properties: command.properties ?? command.lock.properties,
		};
	}
	return null;
};

export const mutationToCheckCommand = ({
	mutation,
	feature,
}: {
	mutation: SubjectStateMutation;
	feature: Feature;
}): CheckCommand | null => {
	const tracked = mutationToTrackedFeature({ mutation });
	const { command } = mutation;
	if (!tracked || (command.type !== "track" && command.type !== "finalize"))
		return null;
	return {
		schemaVersion: 1,
		type: "check",
		requestId: mutation.id,
		identity: mutation.identity,
		occurredAt: command.occurredAt,
		org: command.org,
		featureId: feature.id,
		internalFeatureId: feature.internal_id,
		requiredBalance: A_HAIR_ABOVE_ZERO,
		properties: tracked.properties,
	};
};
