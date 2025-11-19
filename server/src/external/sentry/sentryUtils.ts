import * as Sentry from "@sentry/bun";
import type { AutumnContext } from "../../honoUtils/HonoEnv";

export const setSentryTags = ({
	ctx,
	customerId,
	messageId,
}: {
	ctx: AutumnContext;
	customerId?: string;
	messageId?: string;
}) => {
	Sentry.setTags({
		org_id: ctx.org.id,
		org_slug: ctx.org.slug,
		env: ctx.env,
		request_id: ctx.id,
		customer_id: customerId,
		message_id: messageId,
	});
};
