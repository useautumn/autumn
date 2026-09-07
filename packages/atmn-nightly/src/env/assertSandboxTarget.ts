import type { Target } from "./resolveTarget";

const TEST_KEY_PREFIX = "am_sk_test";

export const SANDBOX_ONLY_REFUSAL =
	"Reset only wipes sandboxes; the key for this target is a live key.";

/**
 * A live key never even reaches the server: the wipe is irreversible, so it is
 * refused here rather than left to the server's 400.
 */
export const assertSandboxTarget = ({ target }: { target: Target }): void => {
	if (target.secretKeyName === "AUTUMN_PROD_SECRET_KEY")
		throw new Error(SANDBOX_ONLY_REFUSAL);

	const key = process.env[target.secretKeyName];
	// A key that is not set at all is requireSecretKey's error to give.
	if (key !== undefined && !key.startsWith(TEST_KEY_PREFIX))
		throw new Error(SANDBOX_ONLY_REFUSAL);
};
