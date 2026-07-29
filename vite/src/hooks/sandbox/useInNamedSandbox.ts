import { AppEnv } from "@autumn/shared";
import { useActiveSandbox } from "@/hooks/sandbox/useActiveSandbox";
import { useEnv } from "@/utils/envUtils";

export const useInNamedSandbox = () => {
	const env = useEnv();
	const activeSandbox = useActiveSandbox();
	return env === AppEnv.Sandbox && Boolean(activeSandbox);
};
