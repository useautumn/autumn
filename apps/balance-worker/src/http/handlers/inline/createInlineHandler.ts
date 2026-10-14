import type { InlineHandler } from "../../workerThreads/types/inlineHandler.js";
import { receiveCheckInline } from "./receiveCheckInline.js";
import { receiveTrackBatchInline } from "./receiveTrackBatchInline.js";
import { receiveTrackInline } from "./receiveTrackInline.js";
import type { InlineHandlerContext } from "./types/inlineHandlerContext.js";

const INLINE_RECEIVERS = [
	{ path: "/v1/track", receive: receiveTrackInline },
	{ path: "/v1/track-batch", receive: receiveTrackBatchInline },
	{ path: "/v1/check", receive: receiveCheckInline },
];

export const INLINE_ROUTES = INLINE_RECEIVERS.map(({ path }) => path);

export function createInlineHandler({
	ctx,
}: {
	ctx: InlineHandlerContext;
}): InlineHandler {
	function handle({ route, body }: { route: number; body: Uint8Array }) {
		return INLINE_RECEIVERS[route]?.receive({ ctx, body }) ?? null;
	}
	return handle;
}
