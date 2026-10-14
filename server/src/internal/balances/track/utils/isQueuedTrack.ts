import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { isAsyncTrackEnabled } from "@/internal/misc/asyncTrack/asyncTrackStore.js";

export const isQueuedTokenTrack = ({ body }: { body: { async?: boolean } }) =>
	body.async !== false;

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
