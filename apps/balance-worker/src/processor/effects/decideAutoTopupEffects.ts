import { subjectToAutoTopupTriggers } from "@autumn/auto-topup";
import type {
	AutoTopupEffect,
	SubjectStateMutation,
	WorkerFullSubject,
} from "@autumn/balance-engine";

/** The feature a mutation drew on: a track names it, a finalize settles its lock's. Nothing else tops up. */
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

/** One effect per feature whose auto top-up job should run now, read off the subject as the mutation left it. */
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
