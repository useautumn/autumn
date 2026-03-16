import { Box } from "ink";
import type { ReactNode } from "react";

export type FocusTarget = "main" | "side";

export interface SplitPaneProps {
	/** The main content (typically DataTable) */
	main: ReactNode;
	/** Optional sidebar content (typically DetailSheet) */
	side?: ReactNode;
	/** Which pane has focus */
	focusTarget: FocusTarget;
	/** Whether the sidebar is visible */
	sideOpen: boolean;
	/** Optional: extra content to show below main when loading */
	loadingIndicator?: ReactNode;
}

/**
 * A layout component that displays a main content area alongside an optional sidebar.
 * Handles the visual layout only - no keyboard handling or state management.
 *
 * Pattern matches the working `next` branch: NO height constraints, NO overflow.
 * Pure flexbox layout - content flows naturally.
 */
export function SplitPane({
	main,
	side,
	focusTarget,
	sideOpen,
	loadingIndicator,
}: SplitPaneProps) {
	return (
		<Box flexDirection="row" width="100%" flexGrow={1}>
			{/* Main pane - takes remaining space */}
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

			{/* Side pane - fixed width, doesn't shrink */}
			{sideOpen && side && (
				<Box marginLeft={1} flexShrink={0}>
					{side}
				</Box>
			)}
		</Box>
	);
}
