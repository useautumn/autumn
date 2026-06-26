import { AppEnv } from "@autumn/shared";

/**
 * The dashboard's active environment (sandbox/live). The dashboard sends it as
 * the `app_env` header on every chat request; the server chat proxy forwards it
 * verbatim to leaf. Everything downstream — the CMA session, the vault + OAuth
 * credential, and pending-approval lookups — must be scoped to this env so a
 * sandbox dashboard never touches live state (or vice versa). Defaults to
 * Sandbox when the header is missing.
 */
export const resolveDashboardEnv = (
	appEnvHeader: string | null | undefined,
): AppEnv => (appEnvHeader === AppEnv.Live ? AppEnv.Live : AppEnv.Sandbox);
