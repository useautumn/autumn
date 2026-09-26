import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@autumn/ui";
import { createContext, useContext } from "react";

/** Label of the settings group the active section belongs to, shown above its title. */
export const SettingsGroupContext = createContext<string | undefined>(
	undefined,
);

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
	const groupLabel = useContext(SettingsGroupContext);

	return (
		<div className="flex flex-col gap-10">
			<div className="flex items-end justify-between gap-6">
				<div className="flex flex-col gap-2">
					{groupLabel && (
						<span className="font-medium text-subtle text-xs leading-4">
							{groupLabel}
						</span>
					)}
					<h2 className="font-semibold text-[23px] text-foreground leading-7 tracking-[-0.02em]">
						{title}
					</h2>
					<p className="max-w-[480px] text-sm text-tertiary-foreground leading-5">
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
