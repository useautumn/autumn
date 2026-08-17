import { AppEnv } from "@autumn/shared";

export const resolveDashboardEnv = (
	appEnvHeader: string | null | undefined,
): AppEnv => (appEnvHeader === AppEnv.Live ? AppEnv.Live : AppEnv.Sandbox);
