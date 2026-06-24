import { logger } from "@/external/logtail/logtailUtils.js";
import { auth } from "@/utils/auth.js";

const MAX_LOGGED_BODY = 600;

/**
 * better-auth returns plugin `APIError`s (e.g. the oauth-provider "Scope not
 * originally requested" 400) as plain Responses it never logs. Wrap the
 * handler so those failures surface in our logs with the error body.
 */
export const runBetterAuthHandler = async ({
	request,
	route,
	context,
}: {
	request: Request;
	route: string;
	context?: Record<string, unknown>;
}): Promise<Response> => {
	const response = await auth.handler(request);
	if (!response.ok) {
		const body = await response
			.clone()
			.text()
			.catch(() => "");
		logger.warn(`better-auth ${route} responded ${response.status}`, {
			...context,
			status: response.status,
			body: body.slice(0, MAX_LOGGED_BODY),
		});
	}
	return response;
};
