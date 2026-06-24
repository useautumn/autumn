import { type ApiKey, groupAndFormatScopes } from "@autumn/shared";
import { Badge, Tooltip, TooltipContent, TooltipTrigger } from "@autumn/ui";
import type { ColumnDef, Row } from "@tanstack/react-table";
import {
	CalendarIcon,
	ShieldCheckIcon,
	TerminalIcon,
	UserIcon,
} from "lucide-react";
import { formatUnixToDateTime } from "@/utils/formatUtils/formatDateUtils";
import { APIKeyToolbar } from "./APIKeyToolbar";

// Parse meta to get source info
function getSourceInfo(meta: ApiKey["meta"]): {
	type: "cli" | "dashboard" | "autumn_support" | null;
	author?: string;
} {
	if (!meta || typeof meta !== "object") return { type: null };

	if (meta.created_via === "oauth") {
		return { type: "cli" };
	}

	if (meta.created_via === "autumn_support") {
		return { type: "autumn_support" };
	}

	if (meta.author) {
		return { type: "dashboard", author: meta.author };
	}

	return { type: null };
}

export const createAPIKeyTableColumns = (): ColumnDef<ApiKey, unknown>[] => [
	{
		size: 120,
		header: "Name",
		accessorKey: "name",
		cell: ({ row }: { row: Row<ApiKey> }) => {
			return (
				<Tooltip>
					<TooltipTrigger asChild>
						<div className="font-medium text-foreground truncate max-w-[150px]">
							{row.original.name}
						</div>
					</TooltipTrigger>
					<TooltipContent>{row.original.name}</TooltipContent>
				</Tooltip>
			);
		},
	},
	{
		header: "Preview",
		size: 150,
		accessorKey: "prefix",
		cell: ({ row }: { row: Row<ApiKey> }) => {
			const apiKey = row.original;
			return (
				<div className="font-mono justify-start flex w-full group overflow-hidden">
					{apiKey.prefix ? (
						<span className="text-tiny-id"> {apiKey.prefix}</span>
					) : (
						<span className="px-1 text-tertiary-foreground">—</span>
					)}
				</div>
			);
		},
	},
	{
		header: "Source",
		size: 100,
		accessorKey: "meta",
		cell: ({ row }: { row: Row<ApiKey> }) => {
			const source = getSourceInfo(row.original.meta);

			if (source.type === "cli") {
				return (
					<div className="flex justify-start items-center">
						<span className="text-tiny flex items-center gap-1 px-1.5 py-0.5 bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-400 rounded-md">
							<TerminalIcon size={12} />
							CLI
						</span>
					</div>
				);
			}

			if (source.type === "autumn_support") {
				return (
					<div className="flex justify-start items-center">
						<span className="text-tiny flex items-center gap-1 px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded-md">
							<ShieldCheckIcon size={12} />
							Autumn Support
						</span>
					</div>
				);
			}

			if (source.type === "dashboard" && source.author) {
				return (
					<div className="flex justify-start items-center">
						<span className="text-tiny flex items-center gap-1 px-1.5 py-0.5 bg-muted text-muted-foreground rounded-md">
							<UserIcon size={12} className="shrink-0" />
							{source.author}
						</span>
					</div>
				);
			}

			return <div className="text-subtle">—</div>;
		},
	},
	{
		header: "Scopes",
		accessorKey: "scopes",
		size: 150,
		enableSorting: false,
		cell: ({ row }: { row: Row<ApiKey> }) => {
			const scopes = row.original.scopes;
			if (!scopes || scopes.length === 0) {
				return <Badge variant="muted">Full access (unrestricted)</Badge>;
			}

			const grouped = groupAndFormatScopes(scopes);
			if (grouped.length === 0) {
				return <Badge variant="muted">Full access (unrestricted)</Badge>;
			}

			return (
				<Tooltip>
					<TooltipTrigger asChild>
						<span>
							<Badge variant="muted">Scoped</Badge>
						</span>
					</TooltipTrigger>
					<TooltipContent>
						<div className="flex flex-col gap-1">
							{grouped.map((g) => {
								const label = g.actions.includes("write") ? "write" : "read";
								return (
									<div key={g.resource} className="flex items-center gap-2">
										<span className="text-xs text-muted-foreground w-20 shrink-0">
											{g.resourceName.toLowerCase()}
										</span>
										<span className="text-tiny-id bg-muted px-1.5 py-0.5 rounded-md">
											{label}
										</span>
									</div>
								);
							})}
						</div>
					</TooltipContent>
				</Tooltip>
			);
		},
	},
	{
		header: () => (
			<div className="flex items-center gap-1.5">
				<CalendarIcon size={14} className="text-subtle" />
				<span>Created</span>
			</div>
		),
		accessorKey: "created_at",
		size: 120,
		cell: ({ row }: { row: Row<ApiKey> }) => {
			const { date, time } = formatUnixToDateTime(row.original.created_at);
			return (
				<div className="text-xs text-tertiary-foreground pr-4 w-full">
					{date} <span className="truncate">{time}</span>
				</div>
			);
		},
	},
	{
		header: "",
		accessorKey: "actions",
		size: 40,
		enableSorting: false,
		cell: ({ row }: { row: Row<ApiKey> }) => {
			return (
				<div
					className="flex justify-end w-full pr-2"
					onClick={(e) => e.stopPropagation()}
				>
					<APIKeyToolbar apiKey={row.original} />
				</div>
			);
		},
	},
];
