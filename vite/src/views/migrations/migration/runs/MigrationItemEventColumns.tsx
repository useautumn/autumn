import {
	CubeIcon,
	CurrencyCircleDollarIcon,
	StarIcon,
	TagIcon,
	UserIcon,
} from "@phosphor-icons/react";
import type { ColumnDef, Row } from "@tanstack/react-table";
import { MiniCopyButton } from "@/components/v2/buttons/CopyButton";
import type { MigrationItemEvent } from "@/hooks/queries/useMigrationRunsQuery";
import { ItemEventStatusBadge } from "./RunStatusBadge";

const ITEM_KIND_ICONS: Record<string, React.ReactNode> = {
	customer: <UserIcon size={14} className="text-t3" />,
	plan: <CubeIcon size={14} className="text-t3" />,
	price: <CurrencyCircleDollarIcon size={14} className="text-t3" />,
	feature: <StarIcon size={14} className="text-t3" />,
};

function getPreviewLabel(event: MigrationItemEvent): string {
	const preview = event.item_preview;
	if (!preview) return event.item_id;
	return preview.name ?? preview.email ?? preview.id ?? event.item_id;
}

export const createMigrationItemEventColumns = (): ColumnDef<
	MigrationItemEvent,
	unknown
>[] => [
	{
		header: "Kind",
		size: 100,
		accessorKey: "item_kind",
		cell: ({ row }: { row: Row<MigrationItemEvent> }) => (
			<div className="flex items-center gap-1.5">
				{ITEM_KIND_ICONS[row.original.item_kind] ?? (
					<TagIcon size={14} className="text-t3" />
				)}
				<span className="text-xs text-t2 capitalize">
					{row.original.item_kind}
				</span>
			</div>
		),
	},
	{
		header: "Item ID",
		size: 180,
		accessorKey: "item_id",
		cell: ({ row }: { row: Row<MigrationItemEvent> }) => (
			<div className="font-mono justify-start flex w-full group overflow-hidden">
				<MiniCopyButton text={row.original.item_id} />
			</div>
		),
	},
	{
		header: "Preview",
		size: 180,
		cell: ({ row }: { row: Row<MigrationItemEvent> }) => (
			<span className="text-xs text-t2 truncate block">
				{getPreviewLabel(row.original)}
			</span>
		),
	},
	{
		header: "Status",
		size: 110,
		accessorKey: "status",
		cell: ({ row }: { row: Row<MigrationItemEvent> }) => (
			<ItemEventStatusBadge status={row.original.status} />
		),
	},
	{
		header: "Details",
		size: 200,
		cell: ({ row }: { row: Row<MigrationItemEvent> }) => {
			const { response } = row.original;
			if (!response) return <span className="text-xs text-t3">—</span>;
			return (
				<span
					className="text-xs text-t3 font-mono truncate block cursor-help"
					title={JSON.stringify(response, null, 2)}
				>
					{JSON.stringify(response).slice(0, 100)}
				</span>
			);
		},
	},
];
