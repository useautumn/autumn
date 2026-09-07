import { AreaCheckbox } from "@autumn/ui";
import type { ReactNode } from "react";

export function FeatureOverrideArea({
	title,
	description,
	enabled,
	onSeed,
	onClear,
	children,
}: {
	title: string;
	description: string;
	enabled: boolean;
	onSeed: () => void;
	onClear: () => void;
	children: ReactNode;
}) {
	return (
		<AreaCheckbox
			title={title}
			description={description}
			checked={enabled}
			onCheckedChange={(checked) => (checked ? onSeed() : onClear())}
		>
			{children}
		</AreaCheckbox>
	);
}
