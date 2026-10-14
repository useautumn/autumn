import { AppEnv } from "@autumn/shared";
import { cn } from "@/lib/utils";

export function CatalogOrgRow({
	label,
	orgName,
	detail,
	env,
	muted = false,
}: {
	label: string;
	orgName: string;
	detail: string;
	env: AppEnv;
	muted?: boolean;
}) {
	const isLive = env === AppEnv.Live;
	return (
		<div
			className={cn(
				"flex min-w-0 items-center gap-3 text-sm",
				muted && "opacity-60",
			)}
		>
			<span className="w-12 shrink-0 text-tertiary-foreground text-xs">
				{label}
			</span>
			<span className="truncate text-foreground">{orgName}</span>
			<span className="truncate font-mono text-tertiary-foreground text-xs">
				{detail}
			</span>
			<span
				className={cn(
					"inline-flex h-5 shrink-0 items-center gap-1.5 rounded px-1.5 text-xs",
					isLive
						? "bg-green-500/10 text-green-600 dark:text-green-400"
						: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
				)}
			>
				<span className="size-1.5 rounded-full bg-current" />
				{isLive ? "Production" : "Sandbox"}
			</span>
		</div>
	);
}
