import { z } from "zod/v4";
import { SHADOW_ATOM_CONFIG_KEY } from "../../keys.js";

const PercentSchema = z.number().int().min(0).max(100);

/** An org on the shadow Atom: a folder and token per env there, and the share of its customers the Atom holds. */
const ShadowAtomOrgSchema = z.object({
	/** By env: the Atom keeps one catalog per folder, so each env is its own folder and token. */
	encryptedTokens: z.object({
		sandbox: z.string().min(1),
		live: z.string().min(1),
	}),
	registeredAt: z.number(),
	percent: PercentSchema,
	/** What routes until a percent change settles; only the admin routes set it and `changedAt`. */
	previousPercent: PercentSchema.default(0),
	changedAt: z.number().default(0),
});

/** What an admin save sets: where the shadow Atom answers. */
export const ShadowAtomSettingsSchema = z.object({
	endpointUrl: z.url().nullable().default(null),
});

/** Our own multi-tenant Atom, apart from every org's, that load-tests Atom on real traffic from both envs. Staff-only; an empty file is off. */
export const ShadowAtomConfigSchema = ShadowAtomSettingsSchema.extend({
	/** The admin token that registers orgs on it, encrypted. */
	adminEncryptedToken: z.string().nullable().default(null),
	/** By org id. An org not here is never pushed to or checked against the shadow Atom. */
	orgs: z.record(z.string(), ShadowAtomOrgSchema).default({}),
});

export type ShadowAtomOrg = z.infer<typeof ShadowAtomOrgSchema>;
export type ShadowAtomConfig = z.infer<typeof ShadowAtomConfigSchema>;
export type ShadowAtomSettings = z.infer<typeof ShadowAtomSettingsSchema>;

export const shadowAtomConfig = {
	key: SHADOW_ATOM_CONFIG_KEY,
	schema: ShadowAtomConfigSchema,
	defaultValue: (): ShadowAtomConfig => ShadowAtomConfigSchema.parse({}),
} as const;
