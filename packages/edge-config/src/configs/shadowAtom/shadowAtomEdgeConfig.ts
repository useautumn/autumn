import { z } from "zod/v4";
import { SHADOW_ATOM_CONFIG_KEY } from "../../keys.js";

const PercentSchema = z.number().int().min(0).max(100);

/** Starts every shadow Atom's alien external id; on its own it is the one set up before shadow Atoms took Atom ids. */
export const SHADOW_ATOM_EXTERNAL_ID = "autumn-internal-shadow-atom";

/** One folder per org per env, so an Atom serving both envs never mixes them. */
export const shadowAtomIdOf = ({
	orgId,
	env,
}: {
	orgId: string;
	env: string;
}): string => `${orgId}.${env}`;

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

/** One shadow Atom's group and endpoint, and the rest of its record as the server last read it; the server owns that shape. */
const ShadowAtomDeploymentEntrySchema = z.object({
	deploymentGroupId: z.string(),
	endpointUrl: z.url().nullable().default(null),
	deployment: z.record(z.string(), z.unknown()),
});

/** What an admin save sets: where the shadow Atom answers. */
export const ShadowAtomSettingsSchema = z.object({
	endpointUrl: z.url().nullable().default(null),
	/** How herald sends pushes: HTTP to `endpointUrl`, or through the deployment's `pushes` queue. */
	pushTransport: z.enum(["http", "queue"]).default("http"),
	/** Open shadow checks per server process before the next is shed as a timeout; raised only to benchmark an Atom past the server's cap. */
	checkMaxInFlight: z.number().int().min(1).max(1024).default(16),
});

/** Our own multi-tenant Atom, apart from every org's, that load-tests Atom on real traffic from both envs. Staff-only; an empty file is off. */
export const ShadowAtomConfigSchema = ShadowAtomSettingsSchema.extend({
	/** The admin token that registers orgs on it, encrypted. */
	adminEncryptedToken: z.string().nullable().default(null),
	/** By org id. An org not here is never pushed to or checked against the shadow Atom. */
	orgs: z.record(z.string(), ShadowAtomOrgSchema).default({}),
	/** The alien deployment group our shadow Atom runs in; only the admin deployment routes set it. */
	deploymentGroupId: z.string().nullable().default(null),
	/** That group's alien external id, which herald addresses its `pushes` queue by; null in a file from before it was kept. */
	externalId: z.string().nullable().default(null),
	/** The rest of that deployment's record as the server last read it; the server owns its shape. */
	deployment: z.record(z.string(), z.unknown()).nullable().default(null),
	/** Earlier shadow Atoms still being removed, oldest first; each leaves once alien has nothing left of it. */
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
