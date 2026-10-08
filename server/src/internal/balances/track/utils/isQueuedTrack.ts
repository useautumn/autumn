import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { isAsyncTrackEnabled } from "@/internal/misc/asyncTrack/asyncTrackStore.js";

/** A latest-format track_tokens body queues unless it asks for `async: false`. */
export const isQueuedTokenTrack = ({ body }: { body: { async?: boolean } }) =>
	body.async !== false;

/** A latest-format track body queues unless it asks for `async: false`; the org async override always queues. */
export const isQueuedTrack = ({
	ctx,
	body,
}: {
	ctx: { org?: Pick<AutumnContext["org"], "id" | "slug"> };
	body: { async?: boolean };
}) =>
	isQueuedTokenTrack({ body }) ||
	(ctx.org !== undefined &&
		isAsyncTrackEnabled({ orgId: ctx.org.id, orgSlug: ctx.org.slug }));
