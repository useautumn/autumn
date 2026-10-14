import type { Organization } from "@autumn/shared";
import { AppEnv } from "@autumn/shared";
import type { User } from "better-auth";
import type { Organization as BetterAuthOrganization } from "better-auth/plugins/organization";
import { isUniqueConstraintError } from "@/db/dbUtils.js";
import { db } from "@/db/initDrizzle.js";
import { deleteConnectedAccount } from "@/external/connect/connectUtils.js";
import { logger } from "@/external/logtail/logtailUtils.js";
import { createSvixApp, deleteSvixApp } from "@/external/svix/svixHelpers.js";
import { OrgService } from "@/internal/orgs/OrgService.js";
import { createConnectAccount } from "@/internal/orgs/orgUtils/createConnectAccount.js";
import { generatePublishableKey } from "../encryptUtils.js";
import { captureOrgEvent } from "../posthog.js";

type CreatedResources = { stripeAccountId?: string; svixAppIds: string[] };

const initOrgSvixApps = async ({ id, slug }: { id: string; slug: string }) => {
	const [sandboxApp, liveApp] = await Promise.all([
		createSvixApp({
			name: `${slug}_${AppEnv.Sandbox}`,
			orgId: id,
			env: AppEnv.Sandbox,
		}),
		createSvixApp({
			name: `${slug}_${AppEnv.Live}`,
			orgId: id,
			env: AppEnv.Live,
		}),
	]);

	return { sandboxApp, liveApp };
};

const rollbackOrgResources = async (created: CreatedResources) => {
	if (!created.stripeAccountId && created.svixAppIds.length === 0) {
		return;
	}
	logger.error(
		`Rolling back partial org provisioning: stripe=${created.stripeAccountId ?? "-"}, svix=[${created.svixAppIds.join(",")}]`,
	);
	for (const appId of created.svixAppIds) {
		await deleteSvixApp({ appId });
	}
	if (created.stripeAccountId) {
		await deleteConnectedAccount({
			accountId: created.stripeAccountId,
			env: AppEnv.Sandbox,
			logger,
		});
	}
};

export const provisionOrgResources = async ({
	org,
	user,
	createStripeAccount = true,
	pkey,
	livePkey,
	strict = false,
}: {
	org: Organization | BetterAuthOrganization;
	user: Pick<User, "email">;
	createStripeAccount?: boolean;
	pkey?: string;
	livePkey?: string;
	strict?: boolean;
}) => {
	const { id, slug, createdAt } = org;
	const created: CreatedResources = { svixAppIds: [] };

	try {
		await OrgService.update({
			db,
			orgId: id,
			updates: {
				created_at: createdAt.getTime(),
			},
		});

		if (createStripeAccount) {
			const stripeConnectAccount = await createConnectAccount({ org, user });
			created.stripeAccountId = stripeConnectAccount.id;

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

		const { sandboxApp, liveApp } = await initOrgSvixApps({ slug, id });
		if (sandboxApp?.id) {
			created.svixAppIds.push(sandboxApp.id);
		}
		if (liveApp?.id) {
			created.svixAppIds.push(liveApp.id);
		}

		if (
			strict &&
			process.env.SVIX_API_KEY &&
			(!sandboxApp?.id || !liveApp?.id)
		) {
			throw new Error(`Failed to provision svix apps for org ${id}`);
		}

		await OrgService.update({
			db,
			orgId: id,
			updates: {
				svix_config: {
					sandbox_app_id: sandboxApp?.id ?? "",
					live_app_id: liveApp?.id ?? "",
				},
				test_pkey: pkey ?? generatePublishableKey(AppEnv.Sandbox),
				live_pkey: livePkey ?? generatePublishableKey(AppEnv.Live),
			},
		});

		logger.info(`Initialized resources for org ${id} (${slug})`);

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
	} catch (error) {
		if (strict) {
			await rollbackOrgResources(created);
		}
		throw error;
	}
};

export const afterOrgCreated = async ({
	org,
	user,
	createStripeAccount = true,
	pkey,
	livePkey,
}: {
	org: Organization | BetterAuthOrganization;
	user: User;
	createStripeAccount?: boolean;
	pkey?: string;
	livePkey?: string;
}) => {
	logger.info(`Org created: ${org.id} (${org.slug})`);

	try {
		await provisionOrgResources({
			org,
			user,
			createStripeAccount,
			pkey,
			livePkey,
		});
		// biome-ignore lint/suspicious/noExplicitAny: don't know what error this is.
	} catch (error: any) {
		if (isUniqueConstraintError(error)) {
			logger.error(`Org ${org.id} already exists in Supabase -- skipping`);
			return;
		}
		logger.error(
			`Failed to insert org. Code: ${error.code}, message: ${error.message}`,
		);
		return;
	}
};
