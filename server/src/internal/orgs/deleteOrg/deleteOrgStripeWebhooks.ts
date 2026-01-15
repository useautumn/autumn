import { AppEnv, type Organization, tryCatch } from "@autumn/shared";
import type { Logger } from "@/external/logtail/logtailUtils.js";
import { deleteStripeWebhook } from "../orgUtils.js";

export const deleteOrgStripeWebhooks = async ({
	org,
	logger,
}: {
	org: Organization;
	logger: Logger;
}) => {
	const { error } = await tryCatch(
		(async () => {
			await deleteStripeWebhook({
				org,
				env: AppEnv.Sandbox,
			});

			await deleteStripeWebhook({
				org,
				env: AppEnv.Live,
			});
		})(),
	);

	if (error) {
		logger.error(
			`Failed to delete stripe webhooks for ${org.id}, ${org.slug}. ${error.message}`,
		);
	}
};
