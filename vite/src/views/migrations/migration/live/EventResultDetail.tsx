import type { Feature } from "@autumn/shared";
import type {
	CustomerPlanChange,
	CustomerPlanItemChange,
} from "@autumn/shared/api/billing/common/customerPlanChange";
import { PackageIcon } from "@phosphor-icons/react";
import { SubscriptionItemRow } from "@/components/forms/update-subscription-v2/components/SubscriptionItemRow";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/v2/tooltips/Tooltip";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import type { MigrationItemEvent } from "@/hooks/queries/useMigrationRunsQuery";
import { cn } from "@/lib/utils";
import { getFeatureIconConfig } from "@/views/products/features/utils/getFeatureIcon";
import { migrationItemToProductItem } from "../shared/migrationItemUtils";

type ItemChange = Partial<CustomerPlanItemChange>;
type PlanChange = Partial<CustomerPlanChange> & {
	plan_id?: string;
	entity_id?: string | null;
	item_changes?: ItemChange[];
};
type BalanceSnapshot = {
	granted?: number;
	remaining?: number;
	usage?: number;
	unlimited?: boolean;
	next_reset_at?: number | null;
};
type BalanceChange = {
	feature_id?: string;
	balance?: BalanceSnapshot;
	previous_attributes?: BalanceSnapshot;
	before?: BalanceSnapshot;
	granted?: number;
};
type FlagChange = { action?: string; feature_id?: string };
type MigrationPreview = {
	plan_changes?: (string | PlanChange)[];
	balance_changes?: (string | BalanceChange)[];
	flag_changes?: (string | FlagChange)[];
};
type ErrorPayload = {
	message?: unknown;
	error?: unknown;
	code?: unknown;
	path?: unknown;
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

function formatUnknownError(value: unknown): string | null {
	if (value === null || value === undefined) return null;
	if (typeof value === "string") return value;
	if (typeof value === "number" || typeof value === "boolean")
		return String(value);
	if (Array.isArray(value))
		return value.map(formatUnknownError).filter(Boolean).join("\n");

	if (typeof value === "object") {
		const payload = value as ErrorPayload;
		const message = formatUnknownError(payload.message ?? payload.error);
		const prefix = [payload.code, payload.path].filter(Boolean).join(" ");
		if (message) return prefix ? `${prefix}: ${message}` : message;

		try {
			return JSON.stringify(value, null, 2);
		} catch {
			return "Unknown error";
		}
	}

	return "Unknown error";
}

const DOT_COLORS: Record<string, string> = {
	activated: "bg-green-500",
	scheduled: "bg-blue-500",
	updated: "bg-amber-500",
	created: "bg-green-500",
	expired: "bg-red-500",
	removed: "bg-red-500",
	deleted: "bg-red-500",
};

const ACTION_LABELS: Record<string, string> = {
	activated: "New",
	scheduled: "Scheduled",
	updated: "Changed",
	created: "New",
	expired: "Removed",
	removed: "Removed",
	deleted: "Removed",
};

function StatusDot({ action }: { action: string }) {
	return (
		<span
			className={cn(
				"size-2 rounded-full shrink-0",
				DOT_COLORS[action] ?? "bg-tertiary-foreground",
			)}
		/>
	);
}


function getPlanId(change: PlanChange): string | undefined {
	return change.subscription?.plan_id ?? change.purchase?.plan_id ?? change.plan_id;
}

function getPlanStatus(change: PlanChange): string | undefined {
	return change.subscription?.status ?? change.purchase?.status;
}


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
				"flex items-center gap-2 h-10 px-3 rounded-xl input-base",
				className,
			)}
		>
			{children}
		</div>
	);
}

function buildItemTooltipLines(
	apiItem: Record<string, unknown>,
	feature: Feature | undefined,
): string[] {
	const lines: string[] = [];
	if (feature?.name) lines.push(feature.name);
	if (apiItem.unlimited === true) lines.push("Unlimited");
	else if (typeof apiItem.included === "number")
		lines.push(`Included: ${(apiItem.included as number).toLocaleString()}`);

	const reset = apiItem.reset as { interval?: string } | undefined;
	if (reset?.interval) lines.push(`Resets: ${reset.interval}`);

	const price = apiItem.price as {
		amount?: number;
		interval?: string;
		billing_method?: string;
	} | null;
	if (price) {
		const parts: string[] = [];
		if (price.billing_method) parts.push(price.billing_method.replaceAll("_", " "));
		if (typeof price.amount === "number") parts.push(`$${price.amount}`);
		if (price.interval) parts.push(`per ${price.interval}`);
		if (parts.length > 0) lines.push(parts.join(" · "));
	}
	return lines;
}

function ItemChangeRow({
	item,
}: {
	item: ItemChange;
}) {
	const { features } = useFeaturesQuery();
	const action = item.action ?? "unknown";

	const apiItem = item.item as Record<string, unknown> | undefined;
	const productItem = apiItem
		? migrationItemToProductItem(apiItem, features)
		: null;

	const feature = features.find((f) => f.id === item.feature_id);
	const isDeleted = action === "deleted";
	const isCreated = action === "created";

	const tooltipLines = apiItem
		? buildItemTooltipLines(apiItem, feature)
		: [];

	const row = productItem ? (
		<div className="ml-4">
		<SubscriptionItemRow
			item={productItem}
			featureId={item.feature_id}
			isDeleted={isDeleted}
			isCreated={isCreated}
			readOnly={!isDeleted}
		/>
		</div>
	) : (
		<ChangeRow className="ml-4">
			<StatusDot action={action} />
			<FeatureIconByFeatureId featureId={item.feature_id} />
			<span className="text-body flex-1 min-w-0 truncate">
				{feature?.name ?? item.feature_id}
			</span>
		</ChangeRow>
	);

	if (tooltipLines.length === 0) return row;

	return (
		<Tooltip>
			<TooltipTrigger asChild>{row}</TooltipTrigger>
			<TooltipContent side="top" className="text-xs">
				{tooltipLines.map((line) => (
					<div key={line}>{line}</div>
				))}
			</TooltipContent>
		</Tooltip>
	);
}

function FeatureIconByFeatureId({ featureId }: { featureId: string | undefined }) {
	const { features } = useFeaturesQuery();
	const feature = features.find((f) => f.id === featureId);
	const config = feature
		? getFeatureIconConfig(feature.type, feature.config?.usage_type, 14)
		: getFeatureIconConfig(null, null, 14);
	return <span className={cn("shrink-0", config.color)}>{config.icon}</span>;
}


function balanceToItemChange(bc: BalanceChange, action = "updated"): ItemChange {
	const balance = bc.balance ?? {};
	const item: Record<string, unknown> = { feature_id: bc.feature_id };
	if (balance.unlimited) item.unlimited = true;
	else if (balance.granted !== undefined) item.included = balance.granted;
	else if (bc.granted !== undefined) item.included = bc.granted;
	return { action, feature_id: bc.feature_id, item };
}

function flagToItemChange(fc: FlagChange, action?: string): ItemChange {
	return { action: action ?? fc.action ?? "updated", feature_id: fc.feature_id, item: { feature_id: fc.feature_id } };
}

function PlanChangeRows({ change, absorbedBalances, absorbedFlags }: { change: PlanChange; absorbedBalances?: BalanceChange[]; absorbedFlags?: FlagChange[] }) {
	const action = change.action ?? "unknown";
	const items = change.item_changes ?? [];
	const planId = getPlanId(change);
	const status = getPlanStatus(change);
	const hasAbsorbed = (absorbedBalances?.length ?? 0) > 0 || (absorbedFlags?.length ?? 0) > 0;

	return (
		<>
			<ChangeRow action={action}>
				<StatusDot action={action} />
				<span className="text-xs text-tertiary-foreground w-14 shrink-0">
					{ACTION_LABELS[action] ?? action}
				</span>
				<PackageIcon size={14} weight="duotone" className="text-tertiary-foreground shrink-0" />
				<span className="text-body flex-1 min-w-0 truncate">
					{planId ?? "Unknown plan"}
				</span>
				{status && (
					<span className="text-body-secondary shrink-0 capitalize">{status}</span>
				)}
			</ChangeRow>
			{items.map((item, i) => (
				<ItemChangeRow key={item.feature_id ?? i} item={item} />
			))}
			{items.length === 0 && hasAbsorbed && (
				<>
					{absorbedFlags?.map((fc, i) => (
						<ItemChangeRow key={fc.feature_id ?? i} item={flagToItemChange(fc, "created")} />
					))}
					{absorbedBalances?.map((bc) => (
						<ItemChangeRow key={bc.feature_id} item={balanceToItemChange(bc, "created")} />
					))}
				</>
			)}
			{items.length === 0 && !hasAbsorbed && action === "updated" && (
				<div className="ml-4 px-3 py-1">
					<span className="text-body-secondary">
						Price, version, or settings changed
					</span>
				</div>
			)}
		</>
	);
}

function PreviewSummary({ preview }: { preview: MigrationPreview }) {
	const planChanges = parseList<PlanChange>(preview.plan_changes);
	const allBalanceChanges = parseList<BalanceChange>(preview.balance_changes);
	const allFlagChanges = parseList<FlagChange>(preview.flag_changes);

	const itemChangeFeatureIds = new Set<string>();
	for (const pc of planChanges) {
		for (const ic of pc.item_changes ?? []) {
			if (ic.feature_id) itemChangeFeatureIds.add(ic.feature_id);
		}
	}

	const standaloneBalanceChanges = allBalanceChanges.filter(
		(bc) => bc.feature_id && !itemChangeFeatureIds.has(bc.feature_id),
	);
	const standaloneFlagChanges = allFlagChanges.filter(
		(fc) => fc.feature_id && !itemChangeFeatureIds.has(fc.feature_id),
	);

	// New plans without item_changes absorb standalone balance/flag changes as children
	const newPlanIndex = planChanges.findIndex(
		(pc) =>
			(pc.action === "activated" || pc.action === "created") &&
			!(pc.item_changes?.length),
	);
	const absorbed =
		newPlanIndex >= 0 &&
		(standaloneBalanceChanges.length > 0 || standaloneFlagChanges.length > 0);

	const total =
		planChanges.length +
		standaloneBalanceChanges.length +
		standaloneFlagChanges.length;

	if (total === 0)
		return <span className="text-sm text-tertiary-foreground">No changes</span>;

	return (
		<div className="flex flex-col gap-1.5">
			{planChanges.map((c, i) => (
				<PlanChangeRows
					key={getPlanId(c) ?? i}
					change={c}
					absorbedBalances={i === newPlanIndex ? standaloneBalanceChanges : undefined}
					absorbedFlags={i === newPlanIndex ? standaloneFlagChanges : undefined}
				/>
			))}
			{!absorbed && standaloneBalanceChanges.map((c) => (
				<ItemChangeRow key={c.feature_id} item={balanceToItemChange(c)} />
			))}
			{!absorbed && standaloneFlagChanges.map((c, i) => (
				<ItemChangeRow key={c.feature_id ?? i} item={flagToItemChange(c)} />
			))}
		</div>
	);
}

export function EventResultDetail({ event }: { event: MigrationItemEvent }) {
	const response = event.response as Record<string, unknown> | null;
	if (!response) return null;

	if (event.status === "failed") {
		const error = response.error as ErrorPayload | undefined;
		const message = formatUnknownError(error?.message ?? error);
		if (!message) return null;
		return (
			<div className="flex items-start gap-2 min-h-8 px-3 py-2 rounded-xl border border-red-500/20 bg-red-500/5 text-sm text-red-500">
				<span className="size-2 rounded-full bg-red-500 shrink-0 mt-1" />
				<span className="break-words min-w-0 whitespace-pre-wrap">
					{message}
				</span>
			</div>
		);
	}

	const preview = response.preview as MigrationPreview | undefined;
	if (preview) return <PreviewSummary preview={preview} />;

	if (event.status === "skipped") {
		const skipped = response.skipped as { reason?: unknown } | undefined;
		const guard = response.guard as { reason?: unknown } | undefined;
		const reason = formatUnknownError(skipped?.reason ?? guard?.reason);
		if (reason) return <span className="text-sm text-tertiary-foreground">{reason}</span>;
	}

	return null;
}
