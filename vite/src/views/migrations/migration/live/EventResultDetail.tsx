import { Badge } from "@/components/v2/badges/Badge";
import type { MigrationItemEvent } from "@/hooks/queries/useMigrationRunsQuery";
import { cn } from "@/lib/utils";

type ItemChange = { action?: string; feature_id?: string };
type PlanChange = {
	action?: string;
	plan_id?: string;
	entity_id?: string | null;
	item_changes?: ItemChange[];
};
type BalanceChange = {
	feature_id?: string;
	before?: { granted?: number; remaining?: number; usage?: number };
	granted?: number;
};
type FlagChange = { action?: string; feature_id?: string };
type MigrationPreview = {
	plan_changes?: (string | PlanChange)[];
	balance_changes?: (string | BalanceChange)[];
	flag_changes?: (string | FlagChange)[];
};

function parseJson<T>(raw: string | T): T | null {
	if (typeof raw !== "string") return raw;
	try {
		return JSON.parse(raw) as T;
	} catch {
		return null;
	}
}

function parseList<T>(raw: (string | T)[] | undefined): T[] {
	return (raw ?? [])
		.map((r) => parseJson<T>(r))
		.filter((c): c is T => c !== null);
}

const ACTION_STYLES: Record<string, string> = {
	updated: "bg-blue-500/10 text-blue-500",
	created: "bg-green-500/10 text-green-500",
	removed: "bg-red-500/10 text-red-500",
	deleted: "bg-red-500/10 text-red-500",
};

const ACTION_LABELS: Record<string, string> = {
	updated: "Update",
	created: "Add",
	removed: "Remove",
	deleted: "Remove",
};

function ActionBadge({ action }: { action: string }) {
	return (
		<Badge
			variant="muted"
			className={cn("text-[10px] shrink-0", ACTION_STYLES[action])}
		>
			{ACTION_LABELS[action] ?? action}
		</Badge>
	);
}

function PlanChangeRow({ change }: { change: PlanChange }) {
	const action = change.action ?? "unknown";
	const items = change.item_changes ?? [];

	return (
		<div className="space-y-1">
			<div className="flex items-center gap-1.5">
				<ActionBadge action={action} />
				<span className="text-xs text-t2 truncate font-mono">
					{change.plan_id ?? "Unknown plan"}
				</span>
			</div>
			{items.length > 0 ? (
				<div className="pl-2 border-l-2 border-border ml-1 space-y-0.5">
					{items.map((item, i) => (
						<div
							key={item.feature_id ?? i}
							className="flex items-center gap-1.5 text-[11px]"
						>
							<ActionBadge action={item.action ?? "unknown"} />
							<span className="text-t3">{item.feature_id}</span>
						</div>
					))}
				</div>
			) : action === "updated" ? (
				<span className="text-[11px] text-t3 pl-1">
					Plan configuration updated (price, version, or settings)
				</span>
			) : null}
		</div>
	);
}

function PreviewSummary({ preview }: { preview: MigrationPreview }) {
	const planChanges = parseList<PlanChange>(preview.plan_changes);
	const balanceChanges = parseList<BalanceChange>(preview.balance_changes);
	const flagChanges = parseList<FlagChange>(preview.flag_changes);

	if (planChanges.length + balanceChanges.length + flagChanges.length === 0)
		return (
			<div className="rounded-lg bg-muted px-3 py-2 text-sm text-t3">
				No changes apply to this customer
			</div>
		);

	return (
		<div className="rounded-lg bg-muted px-3 py-2.5 space-y-3">
			{planChanges.length > 0 && (
				<div className="space-y-2">
					<span className="text-[11px] font-medium text-t3">Plans</span>
					{planChanges.map((c, i) => (
						<PlanChangeRow key={c.plan_id ?? i} change={c} />
					))}
				</div>
			)}
			{balanceChanges.length > 0 && (
				<div className="space-y-1">
					<span className="text-[11px] font-medium text-t3">Balances</span>
					{balanceChanges.map((c, i) => (
						<div
							key={c.feature_id ?? i}
							className="flex items-center justify-between gap-2 text-[11px]"
						>
							<span className="text-t2 font-mono">{c.feature_id}</span>
							<span className="text-t3">
								{c.before
									? `${c.before.granted ?? 0} → ${c.granted ?? 0}`
									: (c.granted ?? 0)}{" "}
								granted
							</span>
						</div>
					))}
				</div>
			)}
			{flagChanges.length > 0 && (
				<div className="space-y-1">
					<span className="text-[11px] font-medium text-t3">Features</span>
					{flagChanges.map((c, i) => (
						<div
							key={c.feature_id ?? i}
							className="flex items-center gap-1.5 text-[11px]"
						>
							<ActionBadge action={c.action ?? "unknown"} />
							<span className="text-t2 font-mono">{c.feature_id}</span>
						</div>
					))}
				</div>
			)}
		</div>
	);
}

export function EventResultDetail({ event }: { event: MigrationItemEvent }) {
	const response = event.response as Record<string, unknown> | null;
	if (!response) return null;

	if (event.status === "failed") {
		const error = response.error as { message?: string } | undefined;
		if (!error?.message) return null;
		return (
			<div className="rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2 text-sm text-red-500 break-words">
				{error.message}
			</div>
		);
	}

	const preview = response.preview as MigrationPreview | undefined;
	if (preview) return <PreviewSummary preview={preview} />;

	if (event.status === "skipped") {
		const skipped = response.skipped as { reason?: string } | undefined;
		const guard = response.guard as { reason?: string } | undefined;
		const reason = skipped?.reason ?? guard?.reason;
		if (reason)
			return (
				<div className="rounded-lg bg-muted px-3 py-2 text-sm text-t2">
					{reason}
				</div>
			);
	}

	return null;
}
