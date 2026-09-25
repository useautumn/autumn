import {
	ErrCode,
	type Organization,
	RecaseError,
	type WebhookEventType,
} from "@autumn/shared";
import { Autumn } from "autumn-js";
import { logger } from "@/external/logtail/logtailUtils.js";

const VERCEL_FEATURE_ID = "vercel";

type FeatureCheck = (args: {
	customerId: string;
	featureId: string;
}) => Promise<{ allowed?: boolean }>;

/** Fails open like the sandbox cap: without a key (self-hosted, local) or when
 * Autumn is unreachable, the event types stay available. */
const defaultFeatureCheck: FeatureCheck = async ({ customerId, featureId }) => {
	if (!process.env.AUTUMN_SECRET_KEY) return { allowed: true };
	try {
		const { allowed } = await new Autumn().check({ customerId, featureId });
		return { allowed };
	} catch (error) {
		logger.warn(`[webhooks] vercel feature check failed, allowing: ${error}`);
		return { allowed: true };
	}
};

/** The dashboard's `vercel` flag, dogfooded: a sandbox is billed through its master org. */
const billingCustomerId = ({ org }: { org: Organization }) =>
	org.is_sandbox && org.created_by ? org.created_by : org.id;

export const assertVercelEventsAllowed = async ({
	org,
	events,
	checkFeature = defaultFeatureCheck,
}: {
	org: Organization;
	events: WebhookEventType[];
	checkFeature?: FeatureCheck;
}): Promise<void> => {
	const vercelEvents = events.filter((event) => event.startsWith("vercel."));
	if (vercelEvents.length === 0) return;

	const { allowed } = await checkFeature({
		customerId: billingCustomerId({ org }),
		featureId: VERCEL_FEATURE_ID,
	});
	if (allowed !== false) return;

	throw new RecaseError({
		message: `${[...new Set(vercelEvents)].join(", ")} ${vercelEvents.length === 1 ? "is" : "are"} only available to organizations using the Vercel integration.`,
		code: ErrCode.WebhookEventNotAvailable,
		statusCode: 403,
	});
};
