import { Table, TableBody, TableHead, TableHeader, TableRow } from "@autumn/ui";

interface SettingsTableColumn {
	readonly label: string;
	readonly width: string;
}

interface SettingsTableProps {
	readonly columns: readonly SettingsTableColumn[];
	readonly children: React.ReactNode;
}

const HEAD_CELL_CLASS = "h-7 text-subtle text-tiny font-medium!";

export const SettingsTable = ({ columns, children }: SettingsTableProps) => {
	return (
		<div className="rounded-lg shadow-card border">
			<Table className="p-0 rounded-lg overflow-hidden" flexibleTableColumns>
				<TableHeader>
					<TableRow className="border-b bg-card text-subtle">
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
				<TableBody className="bg-interactive-secondary">{children}</TableBody>
			</Table>
		</div>
	);
};

export { TableCell, TableRow } from "@autumn/ui";

export const SETTINGS_ROW_CLASS =
	"text-tertiary-foreground h-10 hover:bg-interactive-secondary-hover";
