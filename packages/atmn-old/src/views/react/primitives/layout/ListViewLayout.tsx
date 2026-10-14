import { Box, Text } from "ink";
import type { ReactNode } from "react";
import { SearchInput } from "../input/index.js";
import { EmptyState, ErrorState, LoadingState } from "../states/index.js";
import { BottomBar, type KeybindHint } from "./BottomBar.js";
import { TitleBar, type TitleBarItem } from "./TitleBar.js";

export type ListViewState = "loading" | "error" | "empty" | "data";

export interface ListViewLayoutProps {
	viewState: ListViewState;

	commandName: string;
	version?: string;
	paginationText?: string;
	titleBarItems?: TitleBarItem[];

	searchQuery?: string;
	searchOpen?: boolean;
	onSearchSubmit?: (query: string) => void;
	onSearchCancel?: () => void;

	hints: KeybindHint[];

	loadingMessage?: string;

	error?: Error;
	onRetry?: () => void;

	emptyTitle?: string;
	emptyDescription?: string;

	children: ReactNode;
}

export function ListViewLayout({
	viewState,
	commandName,
	version,
	paginationText,
	titleBarItems,
	searchQuery,
	searchOpen,
	onSearchSubmit,
	onSearchCancel,
	hints,
	loadingMessage,
	error,
	onRetry,
	emptyTitle = "No items found",
	emptyDescription,
	children,
}: ListViewLayoutProps) {
	return (
		<Box flexDirection="column" width="100%">
			<TitleBar
				commandName={commandName}
				version={version}
				paginationText={paginationText}
				searchQuery={searchQuery}
				extraItems={titleBarItems}
			/>

			{searchOpen && onSearchSubmit && onSearchCancel && (
				<Box marginTop={1} width="100%">
					<SearchInput
						initialValue={searchQuery}
						onSubmit={onSearchSubmit}
						onCancel={onSearchCancel}
					/>
				</Box>
			)}

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

			<Box marginTop={1} width="100%">
				<BottomBar hints={hints} />
			</Box>
		</Box>
	);
}
