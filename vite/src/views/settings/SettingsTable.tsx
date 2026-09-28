import { Table, TableBody, TableHead, TableHeader, TableRow } from "@autumn/ui";
import { TABLE_TRAY_CLASS } from "@/components/general/table";

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
		<div className={TABLE_TRAY_CLASS}>
			<Table className="p-0 rounded-lg overflow-hidden" flexibleTableColumns>
				<TableHeader>
					<TableRow className="border-b bg-card text-subtle">
						{columns.map((col, i) => (
							<TableHead
								key={col.label || i}
								className={i === 0 ? "pl-4" : undefined}
								style={{ width: col.width }}
							>
								{col.label}
							</TableHead>
						))}
						<TableHead className="w-10" style={{ width: "5%" }} />
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
