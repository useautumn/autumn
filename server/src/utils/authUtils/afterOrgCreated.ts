import type { Organization } from "@autumn/shared";
import { AppEnv } from "@autumn/shared";
import type { User } from "better-auth";
import type { Organization as BetterAuthOrganization } from "better-auth/plugins/organization";
import { isUniqueConstraintError } from "@/db/dbUtils.js";
import { db } from "@/db/initDrizzle.js";
import { logger } from "@/external/logtail/logtailUtils.js";
import { createSvixApp } from "@/external/svix/svixHelpers.js";
import { OrgService } from "@/internal/orgs/OrgService.js";
import { createConnectAccount } from "@/internal/orgs/orgUtils/createConnectAccount.js";
import { generatePublishableKey } from "../encryptUtils.js";
import { captureOrgEvent } from "../posthog.js";

const initOrgSvixApps = async ({
	id,
	slug,
}: {
	id: string;
	slug: string;
}) => {
	const batchCreate = [];
	batchCreate.push(
		createSvixApp({
			name: `${slug}_${AppEnv.Sandbox}`,
			orgId: id,
			env: AppEnv.Sandbox,
		}),
	);
	batchCreate.push(
		createSvixApp({
			name: `${slug}_${AppEnv.Live}`,
			orgId: id,
			env: AppEnv.Live,
		}),
	);

	const [sandboxApp, liveApp] = await Promise.all(batchCreate);

	return { sandboxApp, liveApp };
};

export const afterOrgCreated = async ({
	org,
	user,
	createStripeAccount = true,
}: {
	org: Organization | BetterAuthOrganization;
	user: User;
	createStripeAccount?: boolean;
}) => {
	logger.info(`Org created: ${org.id} (${org.slug})`);
	const { id, slug, createdAt } = org;

	try {
		await OrgService.update({
			db,
			orgId: id,
			updates: {
				created_at: createdAt.getTime(),
			},
		});

		// 1. Add stripe connect config
		if (createStripeAccount) {
			console.log("Creating stripe connect account");
			const stripeConnectAccount = await createConnectAccount({
				org: org,
				user,
			});

			await OrgService.update({
				db,
				orgId: org.id,
				updates: {
					default_currency: "usd",
					test_stripe_connect: {
						default_account_id: stripeConnectAccount.id,
					},
				},
			});
		}

		// 1. Create svix webhoooks
		const { sandboxApp, liveApp } = await initOrgSvixApps({
			slug,
			id,
		});

		await OrgService.update({
			db,
			orgId: id,
			updates: {
				svix_config: {
					sandbox_app_id: sandboxApp?.id ?? "",
					live_app_id: liveApp?.id ?? "",
				},
				test_pkey: generatePublishableKey(AppEnv.Sandbox),
				live_pkey: generatePublishableKey(AppEnv.Live),
			},
		});

		logger.info(`Initialized resources for org ${id} (${slug})`);

		// Only track analytics for self-service signups, not platform-created orgs
		const orgHasCreatedBy = "created_by" in org && org.created_by;
		if (!orgHasCreatedBy) {
			await captureOrgEvent({
				orgId: id,
				event: "org created",
				properties: {
					org_slug: slug,
				},
			});
		}
		// biome-ignore lint/suspicious/noExplicitAny: don't know what error this is.
	} catch (error: any) {
		if (isUniqueConstraintError(error)) {
			logger.error(
				`Org ${id} already exists in Supabase -- skipping creationg`,
			);
			return;
		}
		logger.error(
			`Failed to insert org. Code: ${error.code}, message: ${error.message}`,
		);
		return;
	}
};
