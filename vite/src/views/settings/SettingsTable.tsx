import {
	Table,
	TableBody,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";

interface SettingsTableColumn {
	readonly label: string;
	readonly width: string;
}

interface SettingsTableProps {
	readonly columns: readonly SettingsTableColumn[];
	readonly children: React.ReactNode;
}

const HEAD_CELL_CLASS = "h-7 text-t4 text-tiny font-medium!";

export const SettingsTable = ({ columns, children }: SettingsTableProps) => {
	return (
		<div className="rounded-lg shadow-card border">
			<Table className="p-0 rounded-lg overflow-hidden" flexibleTableColumns>
				<TableHeader>
					<TableRow className="border-b bg-card text-t4">
						{columns.map((col, i) => (
							<TableHead
								key={col.label || i}
								className={`${HEAD_CELL_CLASS}${i === 0 ? " pl-4" : ""}`}
								style={{ width: col.width }}
							>
								{col.label}
							</TableHead>
						))}
						<TableHead className="h-7 w-10" style={{ width: "5%" }} />
					</TableRow>
				</TableHeader>
				<TableBody className="bg-interactive-secondary">
					{children}
				</TableBody>
			</Table>
		</div>
	);
};

export { TableCell, TableRow } from "@/components/ui/table";

export const SETTINGS_ROW_CLASS =
	"text-t3 h-10 hover:bg-interactive-secondary-hover";
