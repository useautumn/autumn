interface SettingsRowProps {
	readonly label: string;
	readonly description: React.ReactNode;
	readonly children: React.ReactNode;
}

export const SettingsRow = ({
	label,
	description,
	children,
}: SettingsRowProps) => {
	return (
		<div className="flex items-center justify-between gap-4">
			<div className="flex flex-col gap-0.5">
				<span className="text-sm font-medium">{label}</span>
				<span className="text-xs text-muted-foreground">{description}</span>
			</div>
			{children}
		</div>
	);
};
