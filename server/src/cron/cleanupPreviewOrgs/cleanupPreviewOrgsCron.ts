import * as Sentry from "@sentry/bun";
import { subDays } from "date-fns";
import { db } from "@/db/initDrizzle.js";
import { hatchet } from "@/external/hatchet/initHatchet.js";
import { logger } from "@/external/logtail/logtailUtils";
import { deleteOrg } from "../../internal/orgs/deleteOrg/deleteOrg";
import { OrgService } from "../../internal/orgs/OrgService";

export const cleanupPreviewOrgsWorkflow = hatchet?.workflow({
	name: "cleanup-preview-orgs",
	onCrons: ["0 8 * * *"], // Run daily at 3 AM UTC
});

cleanupPreviewOrgsWorkflow?.task({
	name: "cleanup-preview-orgs-task",
	executionTimeout: "300s",
	fn: async () => {
		// 1. Find all preview orgs with no memberships
		const orgsToDelete = await OrgService.listPreviewOrgsForDeletion({ db });

		logger.info(`Found ${orgsToDelete.length} preview orgs to delete`);

		// SAFETY: Alert if we're trying to delete too many orgs (possible bug)
		if (orgsToDelete.length > 20) {
			Sentry.captureException(
				`Found ${orgsToDelete.length} preview orgs with no members, too many to run cleanup.`,
			);
			return { deletedCount: 0, totalFound: orgsToDelete.length, errors: 0 };
		}

		let deletedCount = 0;

		for (const previewOrg of orgsToDelete) {
			// SAFETY: Double-check this is actually a preview org
			if (!previewOrg.slug.startsWith("preview|")) {
				logger.error(
					`Attempted to delete non-preview org in cleanup: ${previewOrg.slug}`,
				);
				Sentry.captureException(
					`Attempted to delete non-preview org in cleanup: ${previewOrg.slug}`,
				);
				continue;
			}

			// SAFETY: Don't delete orgs older than 10 days (might be important)
			const tenDaysAgo = subDays(new Date(), 10);
			if (new Date(previewOrg.createdAt).getTime() < tenDaysAgo.getTime()) {
				logger.error(
					`Preview org older than 10 days found in cleanup: ${previewOrg.slug} (created: ${previewOrg.createdAt})`,
				);
				Sentry.captureException(
					`Preview org older than 10 days found in cleanup: ${previewOrg.slug} (created: ${previewOrg.createdAt})`,
				);
				continue;
			}

			logger.info(
				`Deleting preview org: ${previewOrg.id} (${previewOrg.slug})`,
			);

			await deleteOrg({
				org: previewOrg,
				db,
				logger,
				deleteOrgFromDb: true,
			});

			deletedCount++;
			logger.info(
				`Successfully deleted preview org: ${previewOrg.id} (${previewOrg.slug})`,
			);
		}

		return { deletedCount, totalFound: orgsToDelete.length };
	},
});
