import { z } from "zod/v4";
import { SHADOW_ATOM_CONFIG_KEY } from "../../keys.js";

const PercentSchema = z.number().int().min(0).max(100);

export const SHADOW_ATOM_EXTERNAL_ID = "autumn-internal-shadow-atom";

export const shadowAtomIdOf = ({
	orgId,
	env,
}: {
	orgId: string;
	env: string;
}): string => `${orgId}.${env}`;

const ShadowAtomOrgSchema = z.object({
	encryptedTokens: z.object({
		sandbox: z.string().min(1),
		live: z.string().min(1),
	}),
	registeredAt: z.number(),
	percent: PercentSchema,
	previousPercent: PercentSchema.default(0),
	changedAt: z.number().default(0),
});

const ShadowAtomDeploymentEntrySchema = z.object({
	deploymentGroupId: z.string(),
	endpointUrl: z.url().nullable().default(null),
	deployment: z.record(z.string(), z.unknown()),
});

export const ShadowAtomSettingsSchema = z.object({
	endpointUrl: z.url().nullable().default(null),
	pushTransport: z.enum(["http", "queue"]).default("http"),
});

export const ShadowAtomConfigSchema = ShadowAtomSettingsSchema.extend({
	adminEncryptedToken: z.string().nullable().default(null),
	orgs: z.record(z.string(), ShadowAtomOrgSchema).default({}),
	deploymentGroupId: z.string().nullable().default(null),
	externalId: z.string().nullable().default(null),
	deployment: z.record(z.string(), z.unknown()).nullable().default(null),
	previous: z.array(ShadowAtomDeploymentEntrySchema).default([]),
});

export type ShadowAtomOrg = z.infer<typeof ShadowAtomOrgSchema>;
export type ShadowAtomDeploymentEntry = z.infer<
	typeof ShadowAtomDeploymentEntrySchema
>;
export type ShadowAtomConfig = z.infer<typeof ShadowAtomConfigSchema>;
export type ShadowAtomSettings = z.infer<typeof ShadowAtomSettingsSchema>;

export const shadowAtomConfig = {
	key: SHADOW_ATOM_CONFIG_KEY,
	schema: ShadowAtomConfigSchema,
	defaultValue: (): ShadowAtomConfig => ShadowAtomConfigSchema.parse({}),
} as const;
