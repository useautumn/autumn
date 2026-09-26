export const StripeChannelCell = ({
	title,
	meta,
	subtitle,
	connected,
	action,
}: {
	title: string;
	meta?: string;
	subtitle: string;
	connected: boolean;
	action: React.ReactNode;
}) => {
	return (
		<div className="flex items-center gap-4 px-4 py-3.5">
			<div className="flex min-w-0 flex-1 flex-col gap-0.5">
				<div className="flex items-center gap-2">
					<span className="font-medium text-foreground text-sm">{title}</span>
					{meta && (
						<span className="font-medium text-subtle text-tiny">{meta}</span>
					)}
				</div>
				<span className="truncate text-tertiary-foreground text-xs">
					{subtitle}
				</span>
			</div>
			<span className="flex w-[84px] shrink-0">
				{connected && (
					<span className="flex items-center gap-1.5 font-medium text-emerald-500 text-xs">
						<span className="size-1.5 rounded-full bg-emerald-500" />
						Connected
					</span>
				)}
			</span>
			<div className="flex w-24 shrink-0">{action}</div>
		</div>
	);
};
