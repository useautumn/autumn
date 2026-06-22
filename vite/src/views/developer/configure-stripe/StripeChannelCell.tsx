import { cn } from "@/lib/utils";

export const StripeChannelCell = ({
	title,
	subtitle,
	connected,
	action,
	withBorder = false,
}: {
	title: string;
	subtitle: string;
	connected: boolean;
	action: React.ReactNode;
	withBorder?: boolean;
}) => {
	return (
		<div
			className={cn(
				"flex w-full max-w-md items-center justify-between gap-6 py-3",
				withBorder && "border-border border-b",
			)}
		>
			<div className="flex min-w-0 flex-col gap-0.5">
				<div className="flex items-center gap-2">
					<span className="text-body text-sm font-medium">{title}</span>
					{connected && (
						<span className="flex items-center gap-1 text-emerald-500 text-xs">
							<span className="size-1.5 rounded-full bg-emerald-500" />
							Connected
						</span>
					)}
				</div>
				<span className="truncate text-sm text-tertiary-foreground">
					{subtitle}
				</span>
			</div>
			<div className="shrink-0">{action}</div>
		</div>
	);
};
