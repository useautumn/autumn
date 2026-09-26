import {
	type BillingControlKey,
	type CustomerBillingControls,
	type DbUsageAlert,
	type DbUsageLimit,
	type FullCusProduct,
	findPlanBillingControlWithProduct,
	getPlanBillingControlProducts,
	usageLimitIdentity,
} from "@autumn/shared";

export type BillingControlOrigin =
	| { type: "own"; index: number }
	| { type: "customer" }
	| { type: "plan"; customerProductId: string; planName: string };

type BillingControlItem = NonNullable<
	CustomerBillingControls[BillingControlKey]
>[number];

type ResolvedEntry = { item: BillingControlItem; origin: BillingControlOrigin };

export type DisplayedBillingControls = {
	billingControls: CustomerBillingControls;
	origins: Partial<Record<BillingControlKey, BillingControlOrigin[]>>;
};

/** Same inheritance identity the server uses in `mergeControlsByFeature`. */
const identityOf = ({
	key,
	control,
}: {
	key: BillingControlKey;
	control: BillingControlItem;
}) =>
	key === "usage_limits"
		? usageLimitIdentity(control as DbUsageLimit)
		: control.feature_id;

const planOrigin = (customerProduct: FullCusProduct): BillingControlOrigin => ({
	type: "plan",
	customerProductId: customerProduct.id,
	planName: customerProduct.product.name,
});

/** Mirrors `mergeControlsByFeature`: own entry wins, then customer, then the plan resolver. */
const resolveByIdentity = ({
	key,
	ownItems,
	customerItems,
	planProducts,
}: {
	key: BillingControlKey;
	ownItems: BillingControlItem[];
	customerItems: BillingControlItem[];
	planProducts: FullCusProduct[];
}): ResolvedEntry[] => {
	const entries: ResolvedEntry[] = ownItems.map((item, index) => ({
		item,
		origin: { type: "own", index },
	}));
	const taken = new Set(
		ownItems
			.map((control) => identityOf({ key, control }))
			.filter((identity): identity is string => !!identity),
	);

	for (const control of customerItems) {
		const identity = identityOf({ key, control });
		if (!identity || taken.has(identity)) continue;
		taken.add(identity);
		entries.push({ item: control, origin: { type: "customer" } });
	}

	const planIdentities = new Set(
		planProducts.flatMap((customerProduct) =>
			((customerProduct.product?.[key] ?? []) as BillingControlItem[]).map(
				(control) => identityOf({ key, control }),
			),
		),
	);

	for (const identity of planIdentities) {
		if (!identity || taken.has(identity)) continue;
		const resolved = findPlanBillingControlWithProduct<
			BillingControlItem,
			BillingControlKey
		>({
			customerProducts: planProducts,
			controlKey: key,
			matches: (control) => identityOf({ key, control }) === identity,
		});
		if (!resolved) continue;
		entries.push({
			item: resolved.control,
			origin: planOrigin(resolved.customerProduct),
		});
	}

	return entries;
};

/** Mirrors `mergePlanUsageAlerts`: own alerts for a feature shadow all of that feature's plan alerts. */
const resolveUsageAlerts = ({
	ownAlerts,
	planProducts,
}: {
	ownAlerts: DbUsageAlert[];
	planProducts: FullCusProduct[];
}): ResolvedEntry[] => {
	const entries: ResolvedEntry[] = ownAlerts.map((item, index) => ({
		item,
		origin: { type: "own", index },
	}));
	const ownFeatureIds = new Set(
		ownAlerts.map((alert) => alert.feature_id ?? ""),
	);
	const ownerProductByFeature = new Map<string, string>();

	for (const planProduct of planProducts) {
		for (const alert of planProduct.product?.usage_alerts ?? []) {
			const featureKey = alert.feature_id ?? "";
			if (ownFeatureIds.has(featureKey)) continue;

			const owner = ownerProductByFeature.get(featureKey);
			if (owner === undefined) {
				ownerProductByFeature.set(featureKey, planProduct.id);
			} else if (owner !== planProduct.id) {
				continue;
			}
			entries.push({ item: alert, origin: planOrigin(planProduct) });
		}
	}

	return entries;
};

/**
 * Resolves what the server enforces for a customer or entity, tagging each
 * control with where it comes from. Entities inherit customer limits but not alerts.
 */
export const resolveDisplayedBillingControls = ({
	ownControls,
	customerControls,
	customerProducts,
}: {
	ownControls: CustomerBillingControls;
	/** Set only for an entity: the customer's own controls it inherits. */
	customerControls?: CustomerBillingControls;
	customerProducts: FullCusProduct[];
}): DisplayedBillingControls => {
	const isEntity = !!customerControls;
	const planProducts = getPlanBillingControlProducts({ customerProducts });

	const resolvedByKey: Record<BillingControlKey, ResolvedEntry[]> = {
		auto_topups: resolveByIdentity({
			key: "auto_topups",
			ownItems: ownControls.auto_topups ?? [],
			customerItems: [],
			planProducts: isEntity ? [] : planProducts,
		}),
		spend_limits: resolveByIdentity({
			key: "spend_limits",
			ownItems: ownControls.spend_limits ?? [],
			customerItems: customerControls?.spend_limits ?? [],
			planProducts,
		}),
		usage_limits: resolveByIdentity({
			key: "usage_limits",
			ownItems: ownControls.usage_limits ?? [],
			customerItems: customerControls?.usage_limits ?? [],
			planProducts,
		}),
		usage_alerts: resolveUsageAlerts({
			ownAlerts: ownControls.usage_alerts ?? [],
			planProducts: isEntity ? [] : planProducts,
		}),
		overage_allowed: resolveByIdentity({
			key: "overage_allowed",
			ownItems: ownControls.overage_allowed ?? [],
			customerItems: customerControls?.overage_allowed ?? [],
			planProducts,
		}),
	};

	const billingControls: CustomerBillingControls = {};
	const origins: DisplayedBillingControls["origins"] = {};
	for (const [key, entries] of Object.entries(resolvedByKey) as Array<
		[BillingControlKey, ResolvedEntry[]]
	>) {
		if (!entries.length) continue;
		(billingControls as Record<BillingControlKey, BillingControlItem[]>)[key] =
			entries.map((entry) => entry.item);
		origins[key] = entries.map((entry) => entry.origin);
	}

	return { billingControls, origins };
};
