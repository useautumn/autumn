import type { CheckCommand } from "@autumn/balance-engine";
import type { InlineReply } from "../../workerThreads/types/inlineHandler.js";
import { receiveCommandInline } from "./receiveCommandInline.js";
import type { InlineHandlerContext } from "./types/inlineHandlerContext.js";

/** `/v1/check` decided inline; it commits nothing, so its reply goes out at once. */
export function receiveCheckInline({
	ctx,
	body,
}: {
	ctx: InlineHandlerContext;
	body: Uint8Array;
}): InlineReply | null {
	return receiveCommandInline<CheckCommand>({
		ctx,
		body,
		type: "check",
		path: "/v1/check",
		decide: ({ processor, command }) => {
			const decision = processor.checkInline({ command });
			if (decision.kind === "refused") return decision;
			const { reply } = decision;
			return { kind: "decided", body: JSON.stringify(reply), reply, seq: 0 };
		},
	});
}
