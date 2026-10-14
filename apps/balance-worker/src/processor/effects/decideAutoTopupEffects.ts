import { subjectToAutoTopupTriggers } from "@autumn/auto-topup";
import type {
	AutoTopupEffect,
	SubjectStateMutation,
	WorkerFullSubject,
} from "@autumn/balance-engine";

const mutationToTrackedFeatureId = ({
	mutation,
}: {
	mutation: SubjectStateMutation;
}): string | null => {
	const { command } = mutation;
	if (command.type === "track") return command.featureId;
	if (command.type === "finalize") return command.lock.feature_id;
	return null;
};

export const decideAutoTopupEffects = ({
	mutation,
	after,
}: {
	mutation: SubjectStateMutation;
	after: WorkerFullSubject;
}): AutoTopupEffect[] => {
	const featureId = mutationToTrackedFeatureId({ mutation });
	if (!featureId) return [];
	return subjectToAutoTopupTriggers({
		fullSubject: after,
		featureId,
		now: mutation.command.occurredAt,
	}).map(({ featureId, reason }) => ({
		type: "auto_topup",
		featureId,
		reason,
	}));
};
