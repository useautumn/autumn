import { ErrCode, RecaseError } from "@autumn/shared";
import { ApiException } from "svix";

type SvixErrorBody = {
	detail?: string | { loc?: string[]; msg?: string }[];
};

const svixDetail = ({ body }: { body: SvixErrorBody | undefined }) => {
	const detail = body?.detail;
	if (typeof detail === "string") return detail;
	if (Array.isArray(detail)) {
		return detail
			.map((item) => item.msg)
			.filter(Boolean)
			.join("; ");
	}
	return undefined;
};

/** Svix's 4xx answers are the caller's mistake, so they surface as ours;
 * anything else stays a server error. */
export const withSvixErrors = async <T>({
	webhookId,
	run,
}: {
	webhookId?: string;
	run: () => Promise<T>;
}): Promise<T> => {
	try {
		return await run();
	} catch (error) {
		if (!(error instanceof ApiException) || error.code >= 500) throw error;

		if (error.code === 404) {
			throw new RecaseError({
				message: `Webhook ${webhookId} not found`,
				code: ErrCode.WebhookNotFound,
				statusCode: 404,
			});
		}
		if (error.code === 409) {
			throw new RecaseError({
				message: `A webhook with id ${webhookId} already exists`,
				code: ErrCode.DuplicateWebhookId,
				statusCode: 409,
			});
		}
		throw new RecaseError({
			message: `Invalid webhook: ${svixDetail({ body: error.body as SvixErrorBody }) ?? "rejected by the webhook provider"}`,
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}
};
