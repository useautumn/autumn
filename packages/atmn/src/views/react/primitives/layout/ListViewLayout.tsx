import { Box, Text } from "ink";
import type { ReactNode } from "react";
import { SearchInput } from "../input/index.js";
import { EmptyState, ErrorState, LoadingState } from "../states/index.js";
import { BottomBar, type KeybindHint } from "./BottomBar.js";
import { TitleBar, type TitleBarItem } from "./TitleBar.js";

export type ListViewState = "loading" | "error" | "empty" | "data";

export interface ListViewLayoutProps {
	/** Current state of the view */
	viewState: ListViewState;

	// TitleBar props
	commandName: string;
	version?: string;
	paginationText?: string;
	titleBarItems?: TitleBarItem[];

	// Search props
	searchQuery?: string;
	searchOpen?: boolean;
	onSearchSubmit?: (query: string) => void;
	onSearchCancel?: () => void;

	// BottomBar props
	hints: KeybindHint[];

	// Loading state props
	loadingMessage?: string;

	// Error state props
	error?: Error;
	onRetry?: () => void;

	// Empty state props
	emptyTitle?: string;
	emptyDescription?: string;

	// Main content (rendered when viewState === "data")
	children: ReactNode;
}

/**
 * A high-level orchestrator component that composes all primitives into a complete list view layout.
 * This component is a LAYOUT orchestrator - it doesn't handle keyboard input or state management.
 *
 * Pattern matches the working `next` branch: NO height constraints, pure flexbox layout.
 * Content flows naturally, terminal may scroll if content exceeds terminal height.
 */
export function ListViewLayout({
	viewState,
	// TitleBar props
	commandName,
	version,
	paginationText,
	titleBarItems,
	// Search props
	searchQuery,
	searchOpen,
	onSearchSubmit,
	onSearchCancel,
	// BottomBar props
	hints,
	// Loading state props
	loadingMessage,
	// Error state props
	error,
	onRetry,
	// Empty state props
	emptyTitle = "No items found",
	emptyDescription,
	// Main content
	children,
}: ListViewLayoutProps) {
	return (
		<Box flexDirection="column" width="100%">
			{/* Title bar */}
			<TitleBar
				commandName={commandName}
				version={version}
				paginationText={paginationText}
				searchQuery={searchQuery}
				extraItems={titleBarItems}
			/>

			{/* Inline search input (conditional) */}
			{searchOpen && onSearchSubmit && onSearchCancel && (
				<Box marginTop={1} width="100%">
					<SearchInput
						initialValue={searchQuery}
						onSubmit={onSearchSubmit}
						onCancel={onSearchCancel}
					/>
				</Box>
			)}

			{/* Content area */}
			<Box marginTop={1} width="100%" flexGrow={1}>
				{viewState === "loading" && (
					<LoadingState message={loadingMessage} />
				)}

				{viewState === "error" && error && (
					<ErrorState error={error} onRetry={onRetry} />
				)}

				{viewState === "empty" && (
					<EmptyState
						title={emptyTitle}
						description={emptyDescription}
						searchQuery={searchQuery}
					/>
				)}

				{viewState === "data" && children}
			</Box>

			{/* Bottom bar with keybind hints */}
			<Box marginTop={1} width="100%">
				<BottomBar hints={hints} />
			</Box>
		</Box>
	);
}
