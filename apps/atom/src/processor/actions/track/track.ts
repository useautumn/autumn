import type { TrackResponseV3 } from "@autumn/shared";
import { CannotAnswerError } from "../../../lib/forward/cannotAnswerError.js";
import type { SlotProcessorContext } from "../../types/slotProcessor.js";
import type { TrackRequest } from "../../types/track.js";
import { checkToCommand } from "../check/answerCheck.js";
import { readCurrentSubject } from "../readCurrentSubject/readCurrentSubject.js";
import { deductOnSubject } from "./deductOnSubject.js";
import { trackRequestToAnswerableTrack } from "./trackForwardRules.js";
import { trackToCommand } from "./trackToCommand.js";

/** A track the balance covers, deducted here and owed to Autumn as the API's own; answered as the API answers a queued track. */
export const track = async ({
	ctx,
	request,
}: {
	ctx: SlotProcessorContext;
	request: TrackRequest;
}): Promise<TrackResponseV3> => {
	const answerableTrack = trackRequestToAnswerableTrack({ request });
	const { customerId, value } = answerableTrack;

	const subject = readCurrentSubject({ ctx, customerId, entityId: null });
	const command = checkToCommand({
		check: { ...answerableTrack, requiredBalance: value },
		subject,
	});
	const { result, committed } = deductOnSubject({
		ctx,
		subject,
		command,
		track: trackToCommand({
			command,
			subject,
			skipEvent: answerableTrack.skipEvent,
			idempotencyKey: answerableTrack.idempotencyKey,
		}),
	});
	// Whether a track the balance does not cover caps, overflows or is refused is the API's to decide.
	if (!result.allowed) throw new CannotAnswerError({ reason: "track_denied" });
	await committed;
	return { customer_id: customerId, value, balance: null };
};
