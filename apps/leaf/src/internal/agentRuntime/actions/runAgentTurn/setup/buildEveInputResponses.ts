import type { AgentTurnParams } from "../../../domain/agentTurnContext.js";
import type { EveMessageContent } from "../../../eve/client.js";
import { outstandingGatedDenies } from "../../../eve/parkedInput.js";
import type { EveSessionRef } from "../../../eve/types.js";

const OUTSTANDING_PARK_NOTE =
	"(The pending approval remains available in the thread. Its agent park was released only so you can act on the user's new message. Do not treat that release as rejection or rebuild the approval unless this message requests a replacement.)";

export type EveInputResponse = { optionId: string; requestId: string };

const withNotePrefix = ({
	message,
	note,
}: {
	message: EveMessageContent;
	note: string;
}): EveMessageContent =>
	typeof message === "string"
		? `${note}\n\n${message}`
		: [{ text: note, type: "text" as const }, ...message];

/** Everything a continuation post answers: chip answers and a deny for every
 * park still open that nothing else covers. Chip answers
 * are never re-sent as a message, which would replay as a second user turn. */
export const buildEveInputResponses = ({
	message,
	params,
	session,
}: {
	message: EveMessageContent;
	params: AgentTurnParams;
	session?: EveSessionRef;
}): {
	inputResponses?: EveInputResponse[];
	message?: EveMessageContent;
	outstandingDenies: EveInputResponse[];
} => {
	if (!session) return { message, outstandingDenies: [] };
	const chipResponses = params.questionResponse
		? [params.questionResponse]
		: [];
	const explicitResponses = [...chipResponses];
	const outstandingDenies = outstandingGatedDenies({
		answered: explicitResponses,
		session,
	});
	const inputResponses = [...explicitResponses, ...outstandingDenies];
	if (inputResponses.length === 0) return { message, outstandingDenies };
	if (chipResponses.length > 0) return { inputResponses, outstandingDenies };
	const note = outstandingDenies.length > 0 ? OUTSTANDING_PARK_NOTE : undefined;
	return {
		inputResponses,
		message: note ? withNotePrefix({ message, note }) : message,
		outstandingDenies,
	};
};
