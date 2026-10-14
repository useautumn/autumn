import { Box, Text } from "ink";
import { truncate } from "../utils/truncate.js";
import type { Column } from "./index.js";

export interface TableRowProps<T> {
	item: T;
	columns: Column<T>[];
	isSelected: boolean;
	isFocused: boolean;
	columnWidths: number[];
}

export function TableRow<T>({
	item,
	columns,
	isSelected,
	isFocused,
	columnWidths,
}: TableRowProps<T>) {
	const marker = isSelected ? "▸ " : "  ";
	const markerColor = isSelected && isFocused ? "magenta" : "gray";

	return (
		<Box>
			<Text color={markerColor}>{marker}</Text>
			{columns.map((column, index) => {
				const width = columnWidths[index] ?? 10;
				const content = column.render(item, isSelected);

				if (typeof content === "string") {
					const truncated = truncate(content, width);
					return (
						<Box
							key={column.key}
							width={width}
							marginLeft={index > 0 ? 1 : 0}
							overflow="hidden"
						>
							<Text bold={isSelected} dimColor={!isSelected} wrap="truncate">
								{truncated}
							</Text>
						</Box>
					);
				}

				return (
					<Box
						key={column.key}
						width={width}
						marginLeft={index > 0 ? 1 : 0}
						overflow="hidden"
					>
						{content}
					</Box>
				);
			})}
		</Box>
	);
}

export interface TableHeaderProps<T> {
	columns: Column<T>[];
	columnWidths: number[];
}

export function TableHeader<T>({
	columns,
	columnWidths,
}: TableHeaderProps<T>) {
	return (
		<Box marginBottom={0}>
			<Text color="gray">{"  "}</Text>
			{columns.map((column, index) => {
				const width = columnWidths[index] ?? 10;
				return (
					<Box
						key={column.key}
						width={width}
						marginLeft={index > 0 ? 1 : 0}
						overflow="hidden"
					>
						<Text color="gray" bold wrap="truncate">
							{column.header}
						</Text>
					</Box>
				);
			})}
		</Box>
	);
}
