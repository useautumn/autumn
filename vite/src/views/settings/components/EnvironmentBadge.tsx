import { AppEnv } from "@autumn/shared";
import { useActiveSandbox } from "@/hooks/sandbox/useActiveSandbox";
import { cn } from "@/lib/utils";
import { useEnv } from "@/utils/envUtils";

/** Shows which environment a per-environment settings page is editing. */
export const EnvironmentBadge = () => {
	const env = useEnv();
	const activeSandbox = useActiveSandbox();
	const isLive = env === AppEnv.Live;
	const label = isLive ? "Production" : (activeSandbox?.name ?? "Sandbox");

	return (
		<span
			className={cn(
				"flex h-[26px] shrink-0 items-center gap-1.5 rounded-lg border px-2 font-medium text-xs",
				isLive
					? "border-primary/40 bg-primary/10 text-primary"
					: "border-sandbox/40 bg-sandbox/10 text-sandbox",
			)}
		>
			<span
				className={cn(
					"size-1.5 rounded-full",
					isLive ? "bg-primary" : "bg-sandbox",
				)}
			/>
			{label}
		</span>
	);
};
