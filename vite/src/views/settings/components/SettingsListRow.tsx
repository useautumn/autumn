interface SettingsListRowProps {
	readonly title: string;
	readonly description?: React.ReactNode;
	readonly leading?: React.ReactNode;
	readonly children?: React.ReactNode;
}

/** One row inside a `SETTINGS_LIST_CLASS` card: label on the left, control on the right. */
export const SettingsListRow = ({
	title,
	description,
	leading,
	children,
}: SettingsListRowProps) => (
	<div className="flex items-center gap-4 px-4 py-3.5">
		{leading}
		<div className="flex min-w-0 flex-1 flex-col gap-0.5">
			<span className="font-medium text-foreground text-sm">{title}</span>
			{description && (
				<span className="text-tertiary-foreground text-xs">{description}</span>
			)}
		</div>
		{children}
	</div>
);
