import { Box } from "ink";
import type { ReactNode } from "react";

export type FocusTarget = "main" | "side";

export interface SplitPaneProps {
	main: ReactNode;
	side?: ReactNode;
	focusTarget: FocusTarget;
	sideOpen: boolean;
	loadingIndicator?: ReactNode;
}

export function SplitPane({
	main,
	side,
	focusTarget,
	sideOpen,
	loadingIndicator,
}: SplitPaneProps) {
	return (
		<Box flexDirection="row" width="100%" flexGrow={1}>
			<Box
				flexDirection="column"
				borderStyle="round"
				borderColor={focusTarget === "main" ? "magenta" : "gray"}
				paddingX={1}
				flexGrow={1}
				flexShrink={1}
			>
				{main}
				{loadingIndicator && <Box marginTop={1}>{loadingIndicator}</Box>}
			</Box>

			{sideOpen && side && (
				<Box marginLeft={1} flexShrink={0}>
					{side}
				</Box>
			)}
		</Box>
	);
}
