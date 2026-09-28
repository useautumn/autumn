import {
	Button,
	StatusChip,
	type StatusGlyph,
	type StatusTone,
} from "@autumn/ui";
import { useQuery } from "@tanstack/react-query";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import type { EdgeConfigCardDef, EdgeConfigCardTone } from "./edgeConfigCards";

const STATUS_INDICATORS: Record<
	EdgeConfigCardTone,
	{ tone: StatusTone; glyph: StatusGlyph }
> = {
	neutral: { tone: "neutral", glyph: "minus" },
	active: { tone: "green", glyph: "check" },
	warning: { tone: "amber", glyph: "alert" },
};

export const edgeConfigStatusQueryKey = ({ configId }: { configId: string }) =>
	["admin-edge-config-status", configId] as const;

export function EdgeConfigCard<Id extends string>({
	def,
	onEdit,
	secondaryAction,
}: {
	def: EdgeConfigCardDef<Id>;
	onEdit: () => void;
	secondaryAction?: { label: string; onClick: () => void };
}) {
	const axiosInstance = useAxiosInstance();
	const Icon = def.icon;

	const { data, isPending, isError } = useQuery({
		queryKey: edgeConfigStatusQueryKey({ configId: def.id }),
		queryFn: async () => {
			const { data } = await axiosInstance.get(def.endpoint);
			return data;
		},
		staleTime: 15_000,
	});

	const status = isError ? null : data ? def.deriveStatus(data) : null;

	return (
		<div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 transition-colors hover:border-zinc-300 dark:hover:border-zinc-700">
			<div className="flex items-start gap-3">
				<div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-tertiary-foreground">
					<Icon className="size-4" />
				</div>
				<div className="min-w-0 flex-1">
					<div className="truncate text-sm font-medium text-foreground">
						{def.title}
					</div>
					<p className="mt-0.5 text-pretty text-xs text-tertiary-foreground">
						{def.description}
					</p>
				</div>
			</div>

			<div className="mt-auto flex items-center justify-between gap-2 pt-1">
				{isPending && (
					<span className="h-4 w-24 animate-pulse rounded bg-muted" />
				)}

				{!isPending && isError && (
					<StatusChip glyph="x">Unavailable</StatusChip>
				)}

				{!isPending && status && (
					<StatusChip {...STATUS_INDICATORS[status.tone]}>
						{status.label}
					</StatusChip>
				)}

				<div className="flex shrink-0 items-center gap-2">
					{secondaryAction && (
						<Button
							variant="secondary"
							size="sm"
							onClick={secondaryAction.onClick}
						>
							{secondaryAction.label}
						</Button>
					)}
					<Button variant="primary" size="sm" onClick={onEdit}>
						Edit
					</Button>
				</div>
			</div>
		</div>
	);
}
