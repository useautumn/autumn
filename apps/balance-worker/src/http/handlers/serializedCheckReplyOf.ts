import type { CheckReply } from "@autumn/balance-worker-client/protocol";
import { serializeSubjectReply } from "../../processor/replies/serializeSubjectReply.js";

/** A memoised reply is one object per (subject view, selection, second), so its body is serialised once. */
const serializedReplies = new WeakMap<CheckReply, string>();

export function serializedCheckReplyOf({
	reply,
}: {
	reply: CheckReply;
}): string {
	const known = serializedReplies.get(reply);
	if (known !== undefined) return known;
	const body = serializeSubjectReply({ reply });
	serializedReplies.set(reply, body);
	return body;
}
