import { isStagingEnv } from "@autumn/env";

/** Only production checks the plan; staging runs production images, so it is told apart by its own flag. */
export const isPlanEnforced = ({
	runtimeEnv,
}: {
	runtimeEnv: Record<string, string | undefined>;
}): boolean =>
	runtimeEnv.NODE_ENV === "production" && !isStagingEnv({ runtimeEnv });
