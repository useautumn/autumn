import { AreaCheckbox } from "@autumn/ui";
import type { ReactNode } from "react";

/**
 * The enable/clear shell both override kinds share. Turning it on seeds from
 * the feature; turning it off drops the override entirely.
 */
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
