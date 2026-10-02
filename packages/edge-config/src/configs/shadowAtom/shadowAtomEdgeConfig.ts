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

/** One env's shadow Atom: where it answers, the token it answers to, and whom it holds. */
const ShadowAtomEnvConfigSchema = z.object({
	endpointUrl: z.url().nullable().default(null),
	/** Encrypted the way an org's Atom token is; only the admin mint sets it. */
	encryptedToken: z.string().nullable().default(null),
	rollout: ShadowAtomRolloutSchema.prefault({}),
});

/** Our own Atom, apart from every org's, that load-tests Atom on real traffic. Staff-only; an empty file is off. */
export const ShadowAtomConfigSchema = z.object({
	sandbox: ShadowAtomEnvConfigSchema.prefault({}),
	live: ShadowAtomEnvConfigSchema.prefault({}),
});

export type ShadowAtomRollout = z.infer<typeof ShadowAtomRolloutSchema>;
export type ShadowAtomEnvConfig = z.infer<typeof ShadowAtomEnvConfigSchema>;
export type ShadowAtomConfig = z.infer<typeof ShadowAtomConfigSchema>;

export const shadowAtomConfig = {
	key: SHADOW_ATOM_CONFIG_KEY,
	schema: ShadowAtomConfigSchema,
	defaultValue: (): ShadowAtomConfig => ShadowAtomConfigSchema.parse({}),
} as const;
