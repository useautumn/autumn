import {
	TableCell as BaseTableCell,
	TableRow as BaseTableRow,
	Table,
	TableBody,
	TableHead,
	TableHeader,
} from "@autumn/ui";
import {
	TABLE_TRAY_CELL_CLASS,
	TABLE_TRAY_CLASS,
	TABLE_TRAY_HEAD_CLASS,
	TABLE_TRAY_HEADER_ROW_CLASS,
	TABLE_TRAY_ROW_CLASS,
	TABLE_TRAY_TABLE_CLASS,
} from "@/components/general/table";
import { cn } from "@/lib/utils";

interface SettingsTableColumn {
	readonly label: string;
	readonly width: string;
}

interface SettingsTableProps {
	readonly columns: readonly SettingsTableColumn[];
	readonly children: React.ReactNode;
}

export const SettingsTable = ({ columns, children }: SettingsTableProps) => {
	return (
		<div className={cn(TABLE_TRAY_CLASS, TABLE_TRAY_TABLE_CLASS)}>
			<Table className="p-0" flexibleTableColumns>
				<TableHeader>
					<TableRow className={TABLE_TRAY_HEADER_ROW_CLASS}>
						{columns.map((col, i) => (
							<TableHead
								key={col.label || i}
								className={cn(TABLE_TRAY_HEAD_CLASS, i === 0 && "pl-4")}
								style={{ width: col.width }}
							>
								{col.label}
							</TableHead>
						))}
						<TableHead
							className={cn(TABLE_TRAY_HEAD_CLASS, "w-10")}
							style={{ width: "5%" }}
						/>
					</TableRow>
				</TableHeader>
				<TableBody>{children}</TableBody>
			</Table>
		</div>
	);
};

export const TableRow = ({
	className,
	...props
}: React.ComponentProps<typeof BaseTableRow>) => (
	<BaseTableRow className={cn(TABLE_TRAY_ROW_CLASS, className)} {...props} />
);

export const TableCell = ({
	className,
	...props
}: React.ComponentProps<typeof BaseTableCell>) => (
	<BaseTableCell className={cn(TABLE_TRAY_CELL_CLASS, className)} {...props} />
);

export const SETTINGS_ROW_CLASS = "text-tertiary-foreground h-10";
