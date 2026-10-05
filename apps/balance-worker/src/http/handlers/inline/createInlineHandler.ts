/** The business side of the inline seam: the routes the pool may decide inline, and how each is decided. */
import type { InlineHandler } from "../../workerThreads/types/inlineHandler.js";
import { receiveTrackInline } from "./receiveTrackInline.js";
import type { InlineHandlerContext } from "./types/inlineHandlerContext.js";

export const INLINE_ROUTES = ["/v1/track"];

export function createInlineHandler({
	ctx,
}: {
	ctx: InlineHandlerContext;
}): InlineHandler {
	function handle({ body }: { route: number; body: Uint8Array }) {
		return receiveTrackInline({ ctx, body });
	}
	return handle;
}
