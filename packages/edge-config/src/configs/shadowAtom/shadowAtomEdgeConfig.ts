import { z } from "zod/v4";
import { SHADOW_ATOM_CONFIG_KEY } from "../../keys.js";

const PercentSchema = z.number().int().min(0).max(100);

/** Which of an env's customers the shadow Atom holds. A percent change routes once `changedAt` has settled. */
const ShadowAtomRolloutSchema = z.object({
	percent: PercentSchema.default(0),
	/** What routes until the change settles; the admin write keeps it, never the caller. */
	previousPercent: PercentSchema.default(0),
	changedAt: z.number().default(0),
	/** An org's own percent, in place of the env's. */
	orgs: z.record(z.string(), PercentSchema).default({}),
	/** By org id, then customer id: pinned in (true) or out (false) whatever the percent. */
	customers: z
		.record(z.string(), z.record(z.string(), z.boolean()))
		.default({}),
});

/** An org registered on the shadow Atom: its own token there, encrypted the way an org's Atom token is. */
const ShadowAtomOrgSchema = z.object({
	encryptedToken: z.string(),
	registeredAt: z.number(),
});

/** What an admin save sets: where the shadow Atom answers and whom it holds. */
const ShadowAtomEnvSettingsSchema = z.object({
	endpointUrl: z.url().nullable().default(null),
	rollout: ShadowAtomRolloutSchema.prefault({}),
});

/** One env's shadow Atom (ATOM_MODE=multi_tenant). Its tokens are set only by the admin mint and the org register routes. */
const ShadowAtomEnvConfigSchema = ShadowAtomEnvSettingsSchema.extend({
	/** The admin token that registers orgs on it, encrypted. */
	adminEncryptedToken: z.string().nullable().default(null),
	/** By org id. An org not here is never pushed to or checked against the shadow Atom. */
	orgs: z.record(z.string(), ShadowAtomOrgSchema).default({}),
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

export type ShadowAtomRollout = z.infer<typeof ShadowAtomRolloutSchema>;
export type ShadowAtomEnvConfig = z.infer<typeof ShadowAtomEnvConfigSchema>;
export type ShadowAtomConfig = z.infer<typeof ShadowAtomConfigSchema>;
export type ShadowAtomSettings = z.infer<typeof ShadowAtomSettingsSchema>;

export const shadowAtomConfig = {
	key: SHADOW_ATOM_CONFIG_KEY,
	schema: ShadowAtomConfigSchema,
	defaultValue: (): ShadowAtomConfig => ShadowAtomConfigSchema.parse({}),
} as const;
