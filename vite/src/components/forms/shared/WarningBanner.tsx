import { Alert, StatusChipIcon } from "@autumn/ui";
import type { ReactNode } from "react";

export type WarningBannerLine = {
	key: string;
	severity: "warning" | "info";
	content: ReactNode;
};

export function WarningBanner({ lines }: { lines: WarningBannerLine[] }) {
	if (lines.length === 0) return null;

	const isInfoOnly = lines.every((line) => line.severity === "info");

	return (
		<div className="px-4 pt-4">
			<Alert
				variant={isInfoOnly ? "default" : "warning"}
				className="gap-0.5 p-1.5"
			>
				{lines.map((line) => (
					<div key={line.key} className="flex items-center gap-2.5 px-2 py-1.5">
						<StatusChipIcon
							tone={isInfoOnly ? "neutral" : "amber"}
							glyph="alert"
						/>
						<span>{line.content}</span>
					</div>
				))}
			</Alert>
		</div>
	);
}
