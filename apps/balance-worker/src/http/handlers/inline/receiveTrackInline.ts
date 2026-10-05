import type { TrackCommand } from "@autumn/balance-engine";
import type { InlineReply } from "../../workerThreads/types/inlineHandler.js";
import { receiveCommandInline } from "./receiveCommandInline.js";
import type { InlineHandlerContext } from "./types/inlineHandlerContext.js";

/** `/v1/track` decided inline; its reply is held until the log has the write. */
export function receiveTrackInline({
	ctx,
	body,
}: {
	ctx: InlineHandlerContext;
	body: Uint8Array;
}): InlineReply | null {
	return receiveCommandInline<TrackCommand>({
		ctx,
		body,
		type: "track",
		path: "/v1/track",
		decide: ({ processor, command }) => processor.trackInline({ command }),
	});
}
