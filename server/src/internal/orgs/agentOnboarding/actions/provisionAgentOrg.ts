import crypto from "node:crypto";
import { AppEnv, organizations } from "@autumn/shared";
import { eq } from "drizzle-orm";
import { isUniqueConstraintError } from "@/db/dbUtils.js";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { logger } from "@/external/logtail/logtailUtils.js";
import { clearOrgWithFeaturesCache } from "@/external/redis/actions/orgWithFeaturesCache/orgWithFeaturesCache.js";
import { ApiKeyPrefix, createKey } from "@/internal/dev/apiKeys/apiKeyUtils.js";
import { OrgService } from "@/internal/orgs/OrgService.js";
import { provisionOrgResources } from "@/utils/authUtils/afterOrgCreated.js";
import { generateId } from "@/utils/genUtils.js";
import {
	AGENT_PROVISIONAL_API_KEY_SCOPES,
	AGENT_PROVISIONING_KEY_SOURCE,
} from "../agentAuthScopeKeys.js";
import { hashAgentClaimToken } from "../agentAuthUtils.js";
import { createPendingAgentOrg } from "../repos/agentOrgRepo.js";

const CLAIM_TTL_MS = 72 * 60 * 60 * 1000;

/** Stripe requires a contact email; a keyless org has no owner until it's claimed. */
const AGENT_ORG_CONTACT_EMAIL = "support@useautumn.com";

const SLUG_ATTEMPTS = 5;

const randomSlugSuffix = (): string =>
	String(Math.floor(10000000 + Math.random() * 90000000));

const createClaimToken = (): string =>
	crypto.randomBytes(32).toString("base64url");

const buildClaimUrl = ({ claimToken }: { claimToken: string }): string => {
	const frontendUrl = (
		process.env.CLIENT_URL ?? "http://localhost:3000"
	).replace(/\/$/, "");
	return `${frontendUrl}/claim?token=${encodeURIComponent(claimToken)}`;
};

export const provisionAgentOrg = async ({
	db,
	name,
	slug,
	now = new Date(),
}: {
	db: DrizzleCli;
	name: string;
	slug: string;
	now?: Date;
}) => {
	const claimToken = createClaimToken();
	const createOrgAndKey = (orgSlug: string) =>
		db.transaction(async (tx) => {
			const transactionDb = tx as unknown as DrizzleCli;
			const organization = await createPendingAgentOrg({
				db: transactionDb,
				org: {
					id: generateId("org"),
					name,
					slug: orgSlug,
					claimTokenHash: hashAgentClaimToken({ claimToken }),
					claimExpiresAt: new Date(now.getTime() + CLAIM_TTL_MS),
				},
			});
			const apiKey = await createKey({
				db: transactionDb,
				orgId: organization.id,
				env: AppEnv.Sandbox,
				name: "Agent Provisioning API Key",
				prefix: ApiKeyPrefix.Sandbox,
				meta: { source: AGENT_PROVISIONING_KEY_SOURCE },
				scopes: [...AGENT_PROVISIONAL_API_KEY_SCOPES],
			});

			return { organization, apiKey };
		});

	// Slugs come from package names, so two agents on "app" collide; each retry
	// gets a fresh suffix, the same way a signup does.
	const { organization, apiKey } = await (async () => {
		for (let attempt = 0; ; attempt++) {
			try {
				return await createOrgAndKey(
					attempt === 0 ? slug : `${slug}_${randomSlugSuffix()}`,
				);
			} catch (error: unknown) {
				if (!isUniqueConstraintError(error) || attempt >= SLUG_ATTEMPTS)
					throw error;
			}
		}
	})();

	// Stripe account, svix apps and pkeys — the same bring-up a signed-up org
	// gets. Strict so a partial failure rolls back rather than handing the agent
	// a key to an org that can never bill.
	try {
		await provisionOrgResources({
			org: organization,
			user: { email: AGENT_ORG_CONTACT_EMAIL },
			strict: true,
		});
	} catch (error) {
		logger.error(
			`Failed to provision resources for agent org ${organization.id}; removing it`,
			{ error },
		);
		// The api_keys FK cascades, so deleting the org clears the key too.
		await db.delete(organizations).where(eq(organizations.id, organization.id));
		await clearOrgWithFeaturesCache({ orgId: organization.id });
		throw error;
	}

	// Re-read so callers see the provisioned external ids, not the bare insert.
	const provisioned = await OrgService.get({ db, orgId: organization.id });

	return {
		organization: provisioned,
		apiKey,
		claimToken,
		claimUrl: buildClaimUrl({ claimToken }),
		claimExpiresAt: provisioned.claim_expires_at!,
	};
};
