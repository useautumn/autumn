/** The env var holding one sandbox's secret key. */
export type SandboxSecretKeyName = `AUTUMN_SANDBOX_${string}_SECRET_KEY`;

const NON_ALPHANUMERIC_RUN = /[^a-z0-9]+/gi;

/**
 * A sandbox's key lives under a name derived from its id, so a `.env` can hold
 * a key per sandbox and `--sandbox <id>` alone is enough to find the right one.
 */
export const sandboxKeyName = ({
	sandboxId,
}: {
	sandboxId: string;
}): SandboxSecretKeyName =>
	`AUTUMN_SANDBOX_${sandboxId.toUpperCase().replace(NON_ALPHANUMERIC_RUN, "_")}_SECRET_KEY`;

/** The env var `atmn sandbox create --use` writes to pin a target sandbox. */
export const SANDBOX_PIN_NAME = "AUTUMN_SANDBOX_ID";
