import { z } from "zod/v4";
import { SHADOW_ATOM_CONFIG_KEY } from "../../keys.js";

const PercentSchema = z.number().int().min(0).max(100);

/** An org registered on the shadow Atom: its own token there, and the share of its customers the Atom holds. */
const ShadowAtomOrgSchema = z.object({
	encryptedToken: z.string().min(1),
	registeredAt: z.number(),
	percent: PercentSchema,
	/** What routes until a percent change settles; only the admin routes set it and `changedAt`. */
	previousPercent: PercentSchema.default(0),
	changedAt: z.number().default(0),
});

/** What an admin save sets: where the shadow Atom answers. */
const ShadowAtomEnvSettingsSchema = z.object({
	endpointUrl: z.url().nullable().default(null),
});

/** One env's shadow Atom (ATOM_MODE=multi_tenant). Its tokens are set only by the admin mint and the org register routes. */
const ShadowAtomEnvConfigSchema = ShadowAtomEnvSettingsSchema.extend({
	/** The admin token that registers orgs on it, encrypted. */
	adminEncryptedToken: z.string().nullable().default(null),
	/** By org id. An org not here is never pushed to or checked against the shadow Atom. */
	orgs: z.record(z.string(), ShadowAtomOrgSchema).default({}),
	/** The alien deployment group our shadow Atom runs in; only the admin deployment routes set it. */
	deploymentGroupId: z.string().nullable().default(null),
});

/** Our own Atom, apart from every org's, that load-tests Atom on real traffic. Staff-only; an empty file is off. */
export const ShadowAtomConfigSchema = z.object({
	sandbox: ShadowAtomEnvConfigSchema.prefault({}),
	live: ShadowAtomEnvConfigSchema.prefault({}),
});

/** The body of an admin save: unknown keys, tokens and orgs included, are dropped. */
export const ShadowAtomSettingsSchema = z.object({
	sandbox: ShadowAtomEnvSettingsSchema.prefault({}),
	live: ShadowAtomEnvSettingsSchema.prefault({}),
});

export type ShadowAtomOrg = z.infer<typeof ShadowAtomOrgSchema>;
export type ShadowAtomEnvConfig = z.infer<typeof ShadowAtomEnvConfigSchema>;
export type ShadowAtomConfig = z.infer<typeof ShadowAtomConfigSchema>;
export type ShadowAtomSettings = z.infer<typeof ShadowAtomSettingsSchema>;

export const shadowAtomConfig = {
	key: SHADOW_ATOM_CONFIG_KEY,
	schema: ShadowAtomConfigSchema,
	defaultValue: (): ShadowAtomConfig => ShadowAtomConfigSchema.parse({}),
} as const;
