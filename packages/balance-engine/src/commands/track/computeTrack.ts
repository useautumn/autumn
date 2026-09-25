import type { SubjectStateMutation } from "../../models/mutation/subjectStateMutation.js";
import type { WorkerFullSubject } from "../../models/subject/workerFullSubject.js";
import { deductTrack } from "./deductTrack.js";
import { trackOutcomeToMutation } from "./trackOutcomeToMutation.js";
import type { TrackCommand } from "./types/trackCommand.js";

/** Pure: the same subject and command always yield the same mutation. Dedup is the writer's job. */
export const computeTrack = ({
	fullSubject,
	command,
}: {
	fullSubject: WorkerFullSubject;
	command: TrackCommand;
}): SubjectStateMutation =>
	trackOutcomeToMutation({
		command,
		outcome: deductTrack({ fullSubject, command }),
		fullSubject,
	});
