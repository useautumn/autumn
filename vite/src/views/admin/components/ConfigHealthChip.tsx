import { StatusChip } from "@autumn/ui";
import type { ReactNode } from "react";

export function ConfigHealthChip({
	healthy,
	children,
}: {
	healthy?: boolean;
	children?: ReactNode;
}) {
	if (healthy) {
		return (
			<StatusChip tone="green" glyph="check">
				{children ?? "Config healthy"}
			</StatusChip>
		);
	}

	return (
		<StatusChip tone="amber" glyph="alert">
			{children ?? "Config unavailable"}
		</StatusChip>
	);
}
