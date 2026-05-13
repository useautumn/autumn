import type { Feature } from "@autumn/shared";
import { PackageIcon } from "@phosphor-icons/react";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import type { MigrationItemEvent } from "@/hooks/queries/useMigrationRunsQuery";
import { cn } from "@/lib/utils";
import { getFeatureIconConfig } from "@/views/products/features/utils/getFeatureIcon";

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

const DOT_COLORS: Record<string, string> = {
	updated: "bg-amber-500",
	created: "bg-green-500",
	removed: "bg-red-500",
	deleted: "bg-red-500",
};

const ACTION_LABELS: Record<string, string> = {
	updated: "Changed",
	created: "New",
	removed: "Removed",
	deleted: "Removed",
};

function StatusDot({ action }: { action: string }) {
	return (
		<span
			className={cn(
				"size-2 rounded-full shrink-0",
				DOT_COLORS[action] ?? "bg-t3",
			)}
			title={ACTION_LABELS[action] ?? action}
		/>
	);
}

function FeatureIcon({
	featureId,
	features,
}: {
	featureId: string | undefined;
	features: Feature[];
}) {
	const feature = features.find((f) => f.id === featureId);
	const config = feature
		? getFeatureIconConfig(feature.type, feature.config?.usage_type, 14)
		: getFeatureIconConfig(null, null, 14);

	return <span className={cn("shrink-0", config.color)}>{config.icon}</span>;
}

const ROW_TINTS: Record<string, string> = {
	created: "border-green-500/20 bg-green-500/5",
	updated: "border-amber-500/20 bg-amber-500/5",
	removed: "border-red-500/20 bg-red-500/5",
	deleted: "border-red-500/20 bg-red-500/5",
};

function ChangeRow({
	action,
	children,
	className,
}: {
	action?: string;
	children: React.ReactNode;
	className?: string;
}) {
	return (
		<div
			className={cn(
				"flex items-center gap-2 h-8 px-3 rounded-xl border",
				action ? (ROW_TINTS[action] ?? "input-base") : "input-base",
				className,
			)}
		>
			{children}
		</div>
	);
}

function PlanChangeRows({
	change,
	features,
}: {
	change: PlanChange;
	features: Feature[];
}) {
	const action = change.action ?? "unknown";
	const items = change.item_changes ?? [];

	return (
		<>
			<ChangeRow action={action}>
				<StatusDot action={action} />
				<span className="text-xs text-t3 w-14 shrink-0">
					{ACTION_LABELS[action] ?? action}
				</span>
				<PackageIcon size={14} weight="duotone" className="text-t3 shrink-0" />
				<span className="text-body flex-1 min-w-0 truncate">
					{change.plan_id ?? "Unknown plan"}
				</span>
			</ChangeRow>
			{items.map((item, i) => (
				<ChangeRow
					key={item.feature_id ?? i}
					action={item.action ?? "unknown"}
					className="ml-4"
				>
					<StatusDot action={item.action ?? "unknown"} />
					<span className="text-xs text-t3 w-14 shrink-0">
						{ACTION_LABELS[item.action ?? "unknown"] ?? item.action}
					</span>
					<FeatureIcon featureId={item.feature_id} features={features} />
					<span className="text-body flex-1 min-w-0 truncate">
						{features.find((f) => f.id === item.feature_id)?.name ??
							item.feature_id}
					</span>
				</ChangeRow>
			))}
			{items.length === 0 && action === "updated" && (
				<div className="ml-4 px-3 py-1">
					<span className="text-body-secondary">
						Price, version, or settings changed
					</span>
				</div>
			)}
		</>
	);
}

function BalanceChangeRow({
	change,
	features,
}: {
	change: BalanceChange;
	features: Feature[];
}) {
	const feature = features.find((f) => f.id === change.feature_id);

	return (
		<ChangeRow action="updated">
			<StatusDot action="updated" />
			<span className="text-xs text-t3 w-14 shrink-0">Updated</span>
			<FeatureIcon featureId={change.feature_id} features={features} />
			<span className="text-body flex-1 min-w-0 truncate">
				{feature?.name ?? change.feature_id}
			</span>
			<span className="text-body-secondary shrink-0 tabular-nums">
				{change.before ? (
					<>
						{change.before.granted ?? 0}
						<span className="text-t3/50 mx-1">→</span>
						<span className="text-t1 font-semibold">{change.granted ?? 0}</span>
					</>
				) : (
					<span className="text-t1 font-semibold">{change.granted ?? 0}</span>
				)}
			</span>
		</ChangeRow>
	);
}

function FlagChangeRow({
	change,
	features,
}: {
	change: FlagChange;
	features: Feature[];
}) {
	const feature = features.find((f) => f.id === change.feature_id);

	const action = change.action ?? "unknown";
	return (
		<ChangeRow action={action}>
			<StatusDot action={action} />
			<span className="text-xs text-t3 w-14 shrink-0">
				{ACTION_LABELS[action] ?? action}
			</span>
			<FeatureIcon featureId={change.feature_id} features={features} />
			<span className="text-body flex-1 min-w-0 truncate">
				{feature?.name ?? change.feature_id}
			</span>
		</ChangeRow>
	);
}

function PreviewSummary({ preview }: { preview: MigrationPreview }) {
	const { features } = useFeaturesQuery();
	const planChanges = parseList<PlanChange>(preview.plan_changes);
	const balanceChanges = parseList<BalanceChange>(preview.balance_changes);
	const flagChanges = parseList<FlagChange>(preview.flag_changes);

	if (planChanges.length + balanceChanges.length + flagChanges.length === 0)
		return <span className="text-sm text-t3">No changes</span>;

	return (
		<div className="flex flex-col gap-1.5">
			{planChanges.map((c, i) => (
				<PlanChangeRows key={c.plan_id ?? i} change={c} features={features} />
			))}
			{balanceChanges.map((c, i) => (
				<BalanceChangeRow
					key={c.feature_id ?? i}
					change={c}
					features={features}
				/>
			))}
			{flagChanges.map((c, i) => (
				<FlagChangeRow key={c.feature_id ?? i} change={c} features={features} />
			))}
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
			<div className="flex items-center gap-2 h-8 px-3 rounded-xl border border-red-500/20 bg-red-500/5 text-sm text-red-500">
				<span className="size-2 rounded-full bg-red-500 shrink-0" />
				<span className="truncate">{error.message}</span>
			</div>
		);
	}

	const preview = response.preview as MigrationPreview | undefined;
	if (preview) return <PreviewSummary preview={preview} />;

	if (event.status === "skipped") {
		const skipped = response.skipped as { reason?: string } | undefined;
		const guard = response.guard as { reason?: string } | undefined;
		const reason = skipped?.reason ?? guard?.reason;
		if (reason) return <span className="text-sm text-t3">{reason}</span>;
	}

	return null;
}
