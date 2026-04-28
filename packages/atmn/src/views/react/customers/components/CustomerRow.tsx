import { Box, Text } from "ink";
import type { ColumnWidths, CustomerRowProps } from "../types.js";
import { formatDate, truncate } from "../types.js";

/**
 * Single customer row in the table
 */
export function CustomerRow({
	customer,
	isSelected,
	isFocused,
	columnWidths,
}: CustomerRowProps) {
	const marker = isSelected ? "▸ " : "  ";
	const markerColor = isSelected && isFocused ? "magenta" : "gray";

	const { colId, colName, colEmail, colCreated, shouldTruncate } = columnWidths;

	return (
		<Box>
			<Text color={markerColor}>{marker}</Text>
			<Box width={colId}>
				<Text bold={isSelected} dimColor={!isSelected}>
					{shouldTruncate
						? truncate(customer.id, colId - 1)
						: customer.id || "-"}
				</Text>
			</Box>
			<Box width={colName} marginLeft={1}>
				<Text bold={isSelected} dimColor={!isSelected}>
					{shouldTruncate
						? truncate(customer.name, colName - 1)
						: customer.name || "-"}
				</Text>
			</Box>
			<Box width={colEmail} marginLeft={1}>
				<Text bold={isSelected} dimColor={!isSelected}>
					{shouldTruncate
						? truncate(customer.email, colEmail - 1)
						: customer.email || "-"}
				</Text>
			</Box>
			<Box width={colCreated} marginLeft={1}>
				<Text bold={isSelected} dimColor={!isSelected}>
					{formatDate(customer.created_at)}
				</Text>
			</Box>
		</Box>
	);
}

export interface CustomerTableHeaderProps {
	columnWidths: ColumnWidths;
}

/**
 * Table header row
 */
export function CustomerTableHeader({
	columnWidths,
}: CustomerTableHeaderProps) {
	const { colId, colName, colEmail, colCreated } = columnWidths;

	return (
		<Box marginBottom={0}>
			<Text color="gray">{"  "}</Text>
			<Box width={colId}>
				<Text color="gray" bold>
					ID
				</Text>
			</Box>
			<Box width={colName} marginLeft={1}>
				<Text color="gray" bold>
					Name
				</Text>
			</Box>
			<Box width={colEmail} marginLeft={1}>
				<Text color="gray" bold>
					Email
				</Text>
			</Box>
			<Box width={colCreated} marginLeft={1}>
				<Text color="gray" bold>
					Created
				</Text>
			</Box>
		</Box>
	);
}
