import * as Sentry from "@sentry/bun";
import type { AutumnContext } from "../../honoUtils/HonoEnv";

export const setSentryTags = ({
	ctx,
	customerId,
	messageId,
	path,
	method,
}: {
	ctx: AutumnContext;
	customerId?: string;
	messageId?: string;
	path?: string;
	method?: string;
}) => {
	Sentry.setTags({
		org_id: ctx.org.id,
		org_slug: ctx.org.slug,
		env: ctx.env,
		request_id: ctx.id,
		customer_id: customerId,
		message_id: messageId,
		path: path,
		method: method,
	});
};

export const getSentryTags = ({
	ctx,
	customerId,
	messageId,
	path,
	method,
}: {
	ctx: AutumnContext;
	customerId?: string;
	messageId?: string;
	path?: string;
	method?: string;
}) => {
	if (!ctx) return;
	return {
		org_id: ctx.org?.id,
		org_slug: ctx.org?.slug,
		env: ctx.env || "unknown",
		request_id: ctx.id || "",
		customer_id: customerId,
		message_id: messageId,
		path: path,
		method: method,
	};
};
