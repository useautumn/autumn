import crypto from "node:crypto";
import { AppEnv } from "@autumn/shared";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { ApiKeyPrefix, createKey } from "@/internal/dev/apiKeys/apiKeyUtils.js";
import { generateId } from "@/utils/genUtils.js";
import {
	AGENT_PROVISIONAL_API_KEY_SCOPES,
	AGENT_PROVISIONING_KEY_SOURCE,
} from "../agentAuthScopeKeys.js";
import { hashAgentClaimToken } from "../agentAuthUtils.js";
import { createPendingAgentOrg } from "../repos/agentOrgRepo.js";

const CLAIM_TTL_MS = 72 * 60 * 60 * 1000;

const createClaimToken = (): string =>
	crypto.randomBytes(32).toString("base64url");

const buildClaimUrl = ({ claimToken }: { claimToken: string }): string => {
	const frontendUrl = (process.env.CLIENT_URL ?? "http://localhost:3000").replace(
		/\/$/,
		"",
	);
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
	const { organization, apiKey } = await db.transaction(async (tx) => {
		const transactionDb = tx as unknown as DrizzleCli;
		const organization = await createPendingAgentOrg({
			db: transactionDb,
			org: {
				id: generateId("org"),
				name,
				slug,
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

	return {
		organization,
		apiKey,
		claimToken,
		claimUrl: buildClaimUrl({ claimToken }),
		claimExpiresAt: organization.claim_expires_at!,
	};
};
