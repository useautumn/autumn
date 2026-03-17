import { Box } from "ink";
import { ScrollList, type ScrollListRef } from "ink-scroll-list";
import { useEffect, useRef } from "react";
import type { ColumnWidths, CustomersTableProps } from "../types.js";
import { CustomerRow, CustomerTableHeader } from "./CustomerRow.js";

export interface CustomersTableComponentProps extends CustomersTableProps {
	columnWidths: ColumnWidths;
}

/**
 * Scrollable customer table using ink-scroll-list
 */
export function CustomersTable({
	customers,
	selectedIndex,
	onSelect,
	isFocused,
	columnWidths,
}: CustomersTableComponentProps) {
	const listRef = useRef<ScrollListRef>(null);

	// Handle terminal resize
	useEffect(() => {
		const handleResize = () => {
			listRef.current?.remeasure();
		};

		process.stdout.on("resize", handleResize);
		return () => {
			process.stdout.off("resize", handleResize);
		};
	}, []);

	// Update selected customer when index changes
	useEffect(() => {
		if (customers[selectedIndex]) {
			onSelect(customers[selectedIndex], selectedIndex);
		}
	}, [selectedIndex, customers, onSelect]);

	return (
		<Box flexDirection="column" flexGrow={1}>
			<CustomerTableHeader columnWidths={columnWidths} />
			<Box flexDirection="column" flexGrow={1}>
				<ScrollList ref={listRef} selectedIndex={selectedIndex}>
					{customers.map((customer, index) => (
						<CustomerRow
							key={customer.id}
							customer={customer}
							isSelected={index === selectedIndex}
							isFocused={isFocused}
							columnWidths={columnWidths}
						/>
					))}
				</ScrollList>
			</Box>
		</Box>
	);
}
