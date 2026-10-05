import {
	type AddPlanOp,
	BillingMethod,
	FeatureType,
	formatInterval,
	type Operations,
	ResetInterval,
	type UpdatePlanOp,
} from "@autumn/shared";
import {
	intervalSuffix,
	isAbbreviatedInterval,
} from "@/utils/formatUtils/intervalSuffix";
import { planIdsFromFilter } from "../../migration/operations/UpdatePlanOpForm";
import {
	type CappedChips,
	type ChipView,
	capChips,
	type MigrationCatalog,
	pluralize,
	withoutTile,
} from "./chipView";

export type ModificationView = {
	sign: "add" | "change" | "remove";
	chip: ChipView;
	isVersion?: boolean;
};

export type OperationsView = {
	head: ChipView;
	inline: ChipView | null;
	extraCount: number;
	subtitle: string;
	targets: CappedChips;
	modifications: ModificationView[];
	billing: "autumn" | "stripe";
};

type Customize = NonNullable<UpdatePlanOp["customize"]>;
type AddItem = NonNullable<Customize["add_items"]>[number];
type UpdateItem = NonNullable<Customize["update_items"]>[number];
type ItemFilter = UpdateItem["filter"];

const BILLING_METHOD_LABELS: Record<string, string> = {
	[BillingMethod.Prepaid]: "Prepaid",
	[BillingMethod.UsageBased]: "Usage-based",
};

const itemFilterLabel = (filter: ItemFilter): string => {
	const method = filter.billing_method
		? BILLING_METHOD_LABELS[filter.billing_method]
		: "All";
	const parts = [
		`${method} items`,
		filter.interval
			? formatInterval({
					interval: filter.interval,
					intervalCount: filter.interval_count,
					prefix: "",
				})
			: null,
		filter.included === undefined
			? null
			: `${filter.included.toLocaleString("en-US")} included`,
	].filter((part) => part !== null);
	return parts.join(" · ");
};

const updateItemDetail = ({
	item,
	isBoolean,
}: {
	item: UpdateItem;
	isBoolean: boolean;
}): string => {
	const parts = isBoolean
		? []
		: [
				item.included === undefined
					? null
					: `→ ${item.included.toLocaleString("en-US")} included`,
				item.interval ? `resets ${item.interval}` : null,
			].filter((part) => part !== null);
	return parts.length > 0 ? parts.join(", ") : "updated";
};

const perInterval = (interval: string | undefined): string => {
	if (!interval) return "";
	if (isAbbreviatedInterval(interval)) return intervalSuffix({ interval });
	const formatted = formatInterval({
		interval: interval as Parameters<typeof formatInterval>[0]["interval"],
		prefix: " / ",
	});
	return interval === ResetInterval.OneOff ? ` ${formatted}` : formatted;
};

/** Boolean features grant access, not an amount, so they carry no detail. */
const addItemDetail = ({
	item,
	isBoolean,
}: {
	item: AddItem;
	isBoolean: boolean;
}): string | null => {
	if (isBoolean) return null;
	if (item.unlimited) return "+ unlimited";
	if (item.included === undefined) return "added";
	const amount = item.included.toLocaleString("en-US");
	return item.reset
		? `+ ${amount}${perInterval(item.reset.interval)}`
		: `+ ${amount} included`;
};

const priceModification = ({
	customize,
	catalog,
}: {
	customize: Customize;
	catalog: MigrationCatalog;
}): ModificationView => {
	const tile = { tone: "amber", glyph: "currencyCircleDollar" } as const;
	const { price, previous_price: previous } = customize;
	if (!price)
		return {
			sign: "remove",
			chip: { label: "Base price", tile, details: ["removed"] },
		};
	const next = `${catalog.formatAmount(price.amount)}${perInterval(price.interval)}`;
	return {
		sign: "change",
		chip: {
			label: "Base price",
			tile,
			details: [
				previous ? `${catalog.formatAmount(previous.amount)} → ${next}` : next,
			],
		},
	};
};

const addPlanModification = ({
	op,
	catalog,
}: {
	op: AddPlanOp;
	catalog: MigrationCatalog;
}): ModificationView => ({
	sign: "add",
	chip: {
		label: catalog.planName(op.plan_id),
		tile: { tone: "green", glyph: "plusCircle" },
		details: ["new plan"],
	},
});

const updatePlanModifications = ({
	op,
	catalog,
}: {
	op: UpdatePlanOp;
	catalog: MigrationCatalog;
}): ModificationView[] => {
	const customize = op.customize;
	const isBooleanItem = (filter: ItemFilter) =>
		catalog.feature(filter.feature_id ?? "").type === FeatureType.Boolean;
	const itemChip = (filter: ItemFilter, detail: string | null): ChipView => {
		const feature = catalog.feature(filter.feature_id ?? "");
		return {
			label: filter.feature_id ? feature.name : itemFilterLabel(filter),
			tile: feature.tile,
			details: detail === null ? undefined : [detail],
		};
	};
	return [
		...(op.version === undefined
			? []
			: [
					{
						sign: "change" as const,
						isVersion: true,
						chip: {
							label: "Version",
							tile: { tone: "purple", glyph: "gitBranch" } as const,
							details: [`→ v${op.version}`],
						},
					},
				]),
		...(customize && customize.price !== undefined
			? [priceModification({ customize, catalog })]
			: []),
		...(customize?.upsert_licenses ?? []).map((license) => ({
			sign: "change" as const,
			chip: {
				label: catalog.planName(license.license_plan_id),
				tile: { tone: "blue", glyph: "ticket" } as const,
				details: ["customized"],
			},
		})),
		...(customize?.add_items ?? []).map((item) => ({
			sign: "add" as const,
			chip: itemChip(
				item,
				addItemDetail({ item, isBoolean: isBooleanItem(item) }),
			),
		})),
		...(customize?.update_items ?? []).map((item) => ({
			sign: "change" as const,
			chip: itemChip(
				item.filter,
				updateItemDetail({ item, isBoolean: isBooleanItem(item.filter) }),
			),
		})),
		...(customize?.remove_items ?? []).map((item) => ({
			sign: "remove" as const,
			chip: itemChip(item, "removed"),
		})),
	];
};

export const deriveOperationsView = ({
	operations,
	noBillingChanges,
	catalog,
}: {
	operations: Operations | null;
	noBillingChanges: boolean | null;
	catalog: MigrationCatalog;
}): OperationsView | null => {
	const ops = operations?.customer ?? [];
	if (ops.length === 0) return null;

	const modifications = ops.flatMap((op) =>
		op.type === "add_plan"
			? [addPlanModification({ op, catalog })]
			: updatePlanModifications({ op, catalog }),
	);
	const updateOps = ops.filter(
		(op): op is UpdatePlanOp => op.type === "update_plan",
	);
	const targetNames = updateOps.flatMap((op) =>
		planIdsFromFilter(op.plan_filter).map(catalog.planName),
	);
	const [firstUpdate] = updateOps;

	const headModification = firstUpdate
		? null
		: modifications.find((modification) => modification.sign === "add");
	const head: ChipView = headModification?.chip ?? {
		label: targetNames[0] ?? "Plan",
		details:
			firstUpdate?.version === undefined
				? undefined
				: [`→ v${firstUpdate.version}`],
	};
	const inlineCandidates = modifications.filter(
		(modification) =>
			!modification.isVersion && modification !== headModification,
	);
	const [firstInline] = inlineCandidates;

	return {
		head: withoutTile(head),
		inline: firstInline ? withoutTile(firstInline.chip) : null,
		extraCount: Math.max(inlineCandidates.length - 1, 0),
		subtitle: firstUpdate
			? `Update ${pluralize({ count: targetNames.length, noun: "plan" })}`
			: `Add plan ${head.label}`,
		targets: capChips(targetNames.map((label) => ({ label }))),
		modifications,
		billing: noBillingChanges ? "autumn" : "stripe",
	};
};
