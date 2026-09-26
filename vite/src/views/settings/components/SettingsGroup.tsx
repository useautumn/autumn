export const SETTINGS_LIST_CLASS =
	"flex flex-col divide-y rounded-lg border bg-interactive-secondary";

export const SettingsGroup = ({
	title,
	description,
	trailing,
	children,
}: {
	title: string;
	description?: string;
	trailing?: React.ReactNode;
	children: React.ReactNode;
}) => {
	return (
		<section className="flex flex-col gap-3">
			<div className="flex min-h-7 items-end justify-between gap-4">
				<div className="flex flex-col gap-1">
					<h3 className="font-medium text-foreground text-sm leading-4">
						{title}
					</h3>
					{description && (
						<p className="text-subtle text-xs leading-4">{description}</p>
					)}
				</div>
				{trailing}
			</div>
			{children}
		</section>
	);
};
