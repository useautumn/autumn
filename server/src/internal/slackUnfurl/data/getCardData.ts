import {
	type ApiCustomerV5,
	ApiVersionClass,
	type AppEnv,
	CustomerExpand,
	type FullCustomer,
	type FullSubject,
	LATEST_VERSION,
	type RangeEnum,
} from "@autumn/shared";
import { db } from "@/db/initDrizzle.js";
import { createDualLogger } from "@/external/logtail/logtailUtils.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { eventActions } from "@/internal/analytics/actions/eventActions.js";
import { CusService } from "@/internal/customers/CusService.js";
import { getCachedFullSubject } from "@/internal/customers/cache/fullSubject/actions/getCachedFullSubject.js";
import { getApiCustomerV2 } from "@/internal/customers/cusUtils/getApiCustomerV2/index.js";
import { getFullSubject } from "@/internal/customers/repos/getFullSubject/index.js";
import { createWorkerContext } from "@/queue/createWorkerContext.js";
import type {
	BalanceBar,
	CustomerCardData,
	GroupedPlan,
	PlanStatus,
	UsageSeries,
} from "./types.js";

/**
 * Real data layer — runs in-process in the server:
 *   createWorkerContext (org+env ctx, pinned to latest API version)
 *     -> getFullSubject / getCachedFullSubject (aggregated subject)
 *     -> getApiCustomerV2 (plans/balances/flags/invoices)
 *   CusService.getFull (entity count) + eventActions (usage, via Tinybird).
 */
type Subscription = ApiCustomerV5["subscriptions"][number];
type Balance = ApiCustomerV5["balances"][string];
type Invoice = NonNullable<ApiCustomerV5["invoices"]>[number];

/**
 * Subject load: Redis cache first (fast), DB fallback on miss. Both paths still
 * run the subject's lazy resets, so this is a speed win, not a reset-skip.
 */
async function loadSubject(
	ctx: AutumnContext,
	customerId: string,
	entityId?: string,
): Promise<FullSubject | undefined> {
	try {
		const cached = await getCachedFullSubject({
			ctx,
			customerId,
			entityId,
			source: "slack-unfurl",
		});
		if (cached.fullSubject) return cached.fullSubject;
	} catch (error) {
		console.warn(
			`[slack-unfurl] cache read failed, using DB: ${String(error)}`,
		);
	}
	return getFullSubject({ ctx, customerId, entityId });
}

export async function getCardDataLive(
	orgId: string,
	customerId: string,
	env: AppEnv,
): Promise<CustomerCardData | null> {
	// env comes from the URL path (/sandbox/... = sandbox, else live), so we
	// resolve exactly that env. Every query is org+env-scoped → tenant-safe.
	let ctx: AutumnContext | undefined;
	try {
		ctx = await createWorkerContext({
			db,
			payload: { orgId, env, customerId },
			logger: createDualLogger(),
		});
	} catch (error) {
		console.warn(
			`[slack-unfurl] createWorkerContext(${env}) failed for org=${orgId}: ${String(error)}`,
		);
		return null;
	}
	if (!ctx) return null;

	// Pin to the latest API version — otherwise getApiCustomerV2 emits this org's
	// legacy response shape (e.g. v1.2) with no subscriptions/balances/flags keys.
	ctx.apiVersion = new ApiVersionClass(LATEST_VERSION);

	// Invoices + expand each subscription's plan so we get real prices.
	ctx.expand = [CustomerExpand.Invoices, CustomerExpand.SubscriptionsPlan];

	// Aggregated subject (rolls entity-scoped products/entitlements/flags up to
	// the customer) — this is what getApiCustomerV2 is built to consume.
	let fullSubject: FullSubject | undefined;
	try {
		fullSubject = await loadSubject(ctx, customerId);
	} catch (error) {
		console.warn(
			`[slack-unfurl] loadSubject(${env}) failed for ${customerId}: ${String(error)}`,
		);
		return null;
	}
	if (!fullSubject) {
		console.info(
			`[slack-unfurl] no subject ${customerId} in org=${orgId} env=${env}`,
		);
		return null;
	}

	const apiCustomer = await getApiCustomerV2({ ctx, fullSubject });

	// Entity count comes from the full customer (getFullSubject doesn't carry it).
	let fullCustomer: FullCustomer | undefined;
	try {
		fullCustomer = await CusService.getFull({
			ctx,
			idOrInternalId: customerId,
			withSubs: false,
			withEntities: true,
			allowNotFound: true,
		});
	} catch {
		fullCustomer = undefined;
	}
	const entityCount = fullCustomer?.entities?.length ?? 0;

	const featureIds = Object.keys(apiCustomer.balances ?? {});
	const usage = await fetchUsage(ctx, customerId, fullCustomer, featureIds);

	// Prices live at entity level for entity-scoped plans, so the customer view
	// flattens them. Collect each entity's plan prices to widen the range.
	const entityPrices = await fetchEntityPlanPrices(
		ctx,
		customerId,
		fullCustomer?.entities ?? [],
	);

	console.info(
		`[slack-unfurl] resolved ${customerId} (org=${orgId} env=${env}): ` +
			`entities=${entityCount} subs=${apiCustomer.subscriptions?.length ?? 0} ` +
			`balances=${featureIds.length} flags=${Object.keys(apiCustomer.flags ?? {}).length} ` +
			`invoices=${apiCustomer.invoices?.length ?? 0} usagePoints=${usage?.points.length ?? 0}`,
	);
	return mapToCard(orgId, apiCustomer, entityCount, usage, entityPrices);
}

async function fetchUsage(
	ctx: AutumnContext,
	customerId: string,
	fullCustomer: FullCustomer | undefined,
	featureIds: string[],
): Promise<UsageSeries | null> {
	if (featureIds.length === 0 || !fullCustomer) return null;
	const params = {
		customer_id: customerId,
		interval: "7d" as RangeEnum,
		event_names: featureIds, // event_name === feature id
		bin_size: "day" as const,
		aggregateAll: false,
		customer: fullCustomer,
	};
	try {
		const [{ formatted }, totals] = await Promise.all([
			eventActions.aggregate({ ctx, params }),
			eventActions.getCountAndSum({ ctx, params }),
		]);

		const points = (formatted.data ?? []).map((row) => ({
			label: formatPeriod(row.period),
			value: sumNumericExcept(row, "period"),
		}));
		const total = featureIds.reduce(
			(acc, id) => acc + (totals[id]?.sum ?? totals[id]?.count ?? 0),
			0,
		);
		if (points.every((point) => point.value === 0) && total === 0) return null;

		return {
			featureLabel: featureIds.length === 1 ? featureIds[0] : "Usage",
			total,
			points,
		};
	} catch (error) {
		console.warn(`[slack-unfurl] usage fetch failed: ${String(error)}`);
		return null;
	}
}

const sumNumericExcept = (
	row: Record<string, unknown>,
	exclude: string,
): number => {
	let total = 0;
	for (const [key, value] of Object.entries(row)) {
		if (key === exclude) continue;
		if (typeof value === "number") total += value;
		else if (
			typeof value === "string" &&
			value !== "" &&
			!Number.isNaN(Number(value))
		)
			total += Number(value);
	}
	return total;
};

const formatPeriod = (period: unknown): string => {
	const date = new Date(String(period));
	if (Number.isNaN(date.getTime())) return String(period);
	return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

const formatNumber = (value: number): string =>
	Number.isFinite(value) ? value.toLocaleString("en-US") : String(value);

const prettify = (id: string): string =>
	id.replace(/[_-]+/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());

const planStatus = (sub: Subscription): PlanStatus => {
	if (sub.past_due) return "past_due";
	if (sub.canceled_at != null) return "canceled";
	if (sub.trial_ends_at != null) return "trialing";
	return "active";
};

const formatCurrency = (total: number, currency: string | null): string => {
	const code = (currency ?? "usd").toUpperCase();
	try {
		return new Intl.NumberFormat("en-US", {
			style: "currency",
			currency: code,
		}).format(total);
	} catch {
		return `${formatNumber(total)} ${code}`;
	}
};

const planPriceLabel = (sub: Subscription): string => {
	const price = sub.plan?.price;
	if (!price) return sub.add_on ? "Add-on" : "Free";
	if (price.display?.primary_text) {
		return [price.display.primary_text, price.display.secondary_text]
			.filter(Boolean)
			.join(" ");
	}
	return `${formatCurrency(price.amount, null)}/${price.interval}`;
};

type PriceEntry = { amount: number; label: string };

const subPriceEntry = (sub: Subscription): PriceEntry => ({
	amount: sub.plan?.price?.amount ?? 0,
	label: planPriceLabel(sub),
});

/** Single price if every plan in the group prices the same, else "low – high". */
const priceRangeLabel = (entries: PriceEntry[]): string => {
	const uniqueLabels = [...new Set(entries.map((entry) => entry.label))];
	if (uniqueLabels.length <= 1) return uniqueLabels[0] ?? "—";
	const sorted = [...entries].sort((a, b) => a.amount - b.amount);
	const low = sorted[0];
	const high = sorted[sorted.length - 1];
	return low.label === high.label ? low.label : `${low.label} – ${high.label}`;
};

/**
 * Per-entity plan prices keyed by plan name. Entity-scoped plans price at the
 * entity level, so the customer view flattens them — we query each entity's
 * subject to recover the real prices and widen the range. Sequential to avoid
 * racing on the shared ctx.
 */
async function fetchEntityPlanPrices(
	ctx: AutumnContext,
	customerId: string,
	entities: Array<{ id?: string | null }>,
): Promise<Map<string, PriceEntry[]>> {
	const byName = new Map<string, PriceEntry[]>();
	for (const entity of entities) {
		const entityId = entity?.id;
		if (!entityId) continue;
		try {
			const subject = await loadSubject(ctx, customerId, entityId);
			if (!subject) continue;
			const entityApi = await getApiCustomerV2({ ctx, fullSubject: subject });
			for (const sub of entityApi.subscriptions ?? []) {
				const name = sub.plan?.name ?? sub.plan_id;
				const list = byName.get(name) ?? [];
				list.push(subPriceEntry(sub));
				byName.set(name, list);
			}
		} catch (error) {
			console.warn(
				`[slack-unfurl] entity ${entityId} price fetch failed: ${String(error)}`,
			);
		}
	}
	return byName;
}

function groupPlans(
	subscriptions: Subscription[],
	entityPrices: Map<string, PriceEntry[]>,
): GroupedPlan[] {
	// Collapse by plan name. Count comes from the customer view; the price range
	// spans both customer- and entity-level prices (lowest to highest).
	const groups = new Map<
		string,
		{ name: string; count: number; status: PlanStatus; prices: PriceEntry[] }
	>();
	for (const sub of subscriptions) {
		const name = sub.plan?.name ?? sub.plan_id;
		const existing = groups.get(name);
		if (existing) {
			existing.count += 1;
			existing.prices.push(subPriceEntry(sub));
		} else {
			groups.set(name, {
				name,
				count: 1,
				status: planStatus(sub),
				prices: [subPriceEntry(sub)],
			});
		}
	}
	return [...groups.values()].map((group) => {
		// Entity-scoped plans price at the entity level; the customer-level price
		// is flattened (often a phantom "Free"). So when this plan has entity
		// prices, those are authoritative — don't mix in the flattened price.
		const entityList = entityPrices.get(group.name);
		const prices =
			entityList && entityList.length > 0 ? entityList : group.prices;
		return {
			name: group.name,
			count: group.count,
			status: group.status,
			priceLabel: priceRangeLabel(prices),
		};
	});
}

function mapBalances(balances: Record<string, Balance>): BalanceBar[] {
	return Object.entries(balances).map(([featureId, balance]) => {
		if (balance.unlimited) {
			return {
				feature: prettify(balance.feature_id ?? featureId),
				unlimited: true,
				fraction: 1,
				label: "Unlimited",
				over: false,
				overageLabel: null,
			};
		}
		// Overage is derived at read time (not stored): negative remaining, else
		// usage past the grant. Display remaining clamps at 0.
		const granted = balance.granted;
		const rawRemaining = balance.remaining;
		const overage =
			rawRemaining < 0
				? -rawRemaining
				: Math.max(0, (balance.usage ?? 0) - granted);
		const remaining = Math.max(0, rawRemaining);
		const fraction = granted > 0 ? remaining / granted : 0;
		return {
			feature: prettify(balance.feature_id ?? featureId),
			unlimited: false,
			fraction: Math.max(0, Math.min(1, fraction)),
			label: `${formatNumber(remaining)} / ${formatNumber(granted)}`,
			over: overage > 0,
			overageLabel: overage > 0 ? `+${formatNumber(overage)} over` : null,
		};
	});
}

function mapToCard(
	orgId: string,
	apiCustomer: ApiCustomerV5,
	entityCount: number,
	usage: UsageSeries | null,
	entityPrices: Map<string, PriceEntry[]>,
): CustomerCardData {
	// plan_id -> display name, from the (expanded) subscriptions.
	const planNameById = new Map<string, string>();
	for (const sub of apiCustomer.subscriptions ?? []) {
		planNameById.set(sub.plan_id, sub.plan?.name ?? prettify(sub.plan_id));
	}

	const invoices = [...(apiCustomer.invoices ?? [])]
		.sort((a, b) => (b.created_at ?? 0) - (a.created_at ?? 0))
		.slice(0, 3)
		.map((invoice: Invoice) => ({
			products:
				(invoice.plan_ids ?? [])
					.map((id) => planNameById.get(id) ?? prettify(id))
					.join(", ") || "—",
			status: invoice.status ?? null,
			totalLabel: formatCurrency(invoice.total, invoice.currency),
			createdAt:
				invoice.created_at != null
					? new Date(invoice.created_at).toISOString()
					: "",
		}));

	return {
		orgId,
		customerId: apiCustomer.id ?? "",
		name: apiCustomer.name ?? apiCustomer.id ?? "Customer",
		email: apiCustomer.email ?? null,
		createdAt: new Date(apiCustomer.created_at).toISOString(),
		entityCount,
		plans: groupPlans(apiCustomer.subscriptions ?? [], entityPrices),
		balances: mapBalances(apiCustomer.balances ?? {}),
		featureFlags: Object.keys(apiCustomer.flags ?? {}).map(prettify),
		usage,
		invoices,
	};
}
