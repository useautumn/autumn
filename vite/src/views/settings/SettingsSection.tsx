import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/v2/cards/Card";

interface SettingsSectionProps {
	readonly title: string;
	readonly description: string;
	readonly actions?: React.ReactNode;
	readonly children: React.ReactNode;
	readonly card?: {
		readonly title: string;
		readonly description: string;
	};
}

export const SettingsSection = ({
	title,
	description,
	actions,
	children,
	card,
}: SettingsSectionProps) => {
	return (
		<div className="flex flex-col gap-6">
			<div className="flex items-start justify-between">
				<div>
					<h2 className="font-semibold text-foreground leading-none">
						{title}
					</h2>
					<p className="text-sm text-tertiary-foreground mt-1.5">
						{description}
					</p>
				</div>
				{actions}
			</div>
			{card ? (
				<Card className="shadow-none bg-interactive-secondary">
					<CardHeader>
						<CardTitle>{card.title}</CardTitle>
						<CardDescription>{card.description}</CardDescription>
					</CardHeader>
					<CardContent>{children}</CardContent>
				</Card>
			) : (
				children
			)}
		</div>
	);
};
