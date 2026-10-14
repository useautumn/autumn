import { cn } from "@/lib/utils";

export function AgentActivityIndicator({ running }: { running: boolean }) {
	return (
		<span
			aria-hidden="true"
			className={cn(
				"inline-flex size-3 shrink-0 items-center justify-center text-[#9a91aa]",
				running &&
					"rounded-full border border-[#a999be] border-t-transparent motion-safe:animate-spin",
			)}
		>
			{running ? null : "✓"}
		</span>
	);
}
