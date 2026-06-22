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
				"flex w-full items-center justify-between gap-6 py-3",
				withBorder && "border-border border-b",
			)}
		>
			<div className="flex min-w-0 flex-col gap-0.5">
				<span className="text-foreground text-sm font-medium">{title}</span>
				<span className="text-sm text-tertiary-foreground">{subtitle}</span>
			</div>
			<div className="flex shrink-0 items-center gap-4">
				<span className="flex w-20 justify-end">
					{connected && (
						<span className="flex items-center gap-1 text-emerald-500 text-xs">
							<span className="size-1.5 rounded-full bg-emerald-500" />
							Connected
						</span>
					)}
				</span>
				<div className="flex w-36 justify-end">{action}</div>
			</div>
		</div>
	);
};
