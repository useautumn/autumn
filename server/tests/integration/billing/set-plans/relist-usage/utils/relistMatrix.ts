import {
	type ApiCusFeatureV3,
	type ApiCustomerV3,
	BillingInterval,
	BillingMethod,
	type SetPlansParamsV0Input,
	type SetPlansPreviewResponse,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features";
import { hoursToFinalizeInvoice } from "@tests/utils/constants";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { advanceStripeTestClock } from "@tests/utils/stripeUtils/testClock/advanceStripeTestClock";
import { advanceToNextInvoice } from "@tests/utils/testAttachUtils/testAttachUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import { addDays, addHours, addMonths } from "date-fns";
import type Stripe from "stripe";
import { CusService } from "@/internal/customers/CusService";

/** Shapes mirror handoffs/ATMN-746 (plain-Stripe ground truth): Pro $20 + 100 messages incl, $0.10 over. */
export const RELIST = {
	proPrice: 20,
	changedProPrice: 30,
	premiumPrice: 50,
	addOnPrice: 10,
	includedMessages: 100,
	premiumIncludedMessages: 500,
	unitPrice: 0.1,
	changedUnitPrice: 0.15,
	wordsPackPrice: 10,
	wordsPackSize: 100,
	wordsQuantity: 100,
	changedWordsQuantity: 200,
	tracked: 150,
	changeAfterDays: 10,
	customAnchorAfterDays: 20,
} as const;

export type RelistChange =
	| "unchanged"
	| "base_price"
	| "usage_price"
	| "prepaid_quantity"
	| "swap"
	| "drop"
	| "add";
export type RelistAnchor = "unchanged" | "now" | "custom";
export type RelistProration =
	| "prorate_immediately"
	| "none"
	| "bill_difference";

export const RELIST_PRORATIONS: RelistProration[] = [
	"prorate_immediately",
	"none",
	"bill_difference",
];

export const relistCatalog = ({ trialDays }: { trialDays?: number } = {}) => {
	const pro = products.base({
		id: "pro",
		trialDays,
		items: [
			items.monthlyPrice({ price: RELIST.proPrice }),
			items.consumableMessages({
				includedUsage: RELIST.includedMessages,
				price: RELIST.unitPrice,
			}),
			items.prepaid({
				featureId: TestFeature.Words,
				price: RELIST.wordsPackPrice,
				billingUnits: RELIST.wordsPackSize,
			}),
		],
	});
	const premium = products.base({
		id: "premium",
		items: [
			items.monthlyPrice({ price: RELIST.premiumPrice }),
			items.consumableMessages({
				includedUsage: RELIST.premiumIncludedMessages,
				price: RELIST.unitPrice,
			}),
		],
	});
	const addOn = products.base({
		id: "addon",
		isAddOn: true,
		items: [items.monthlyPrice({ price: RELIST.addOnPrice })],
	});
	return { pro, premium, addOn };
};

export type RelistCatalog = ReturnType<typeof relistCatalog>;

const wordsQuantity = (quantity: number) => [
	{ feature_id: TestFeature.Words, quantity },
];

const proItemsWithUsagePrice = (unitPrice: number) => [
	{
		feature_id: TestFeature.Messages,
		included: RELIST.includedMessages,
		price: {
			amount: unitPrice,
			interval: BillingInterval.Month,
			billing_method: BillingMethod.UsageBased,
			billing_units: 1,
		},
	},
	{
		feature_id: TestFeature.Words,
		price: {
			amount: RELIST.wordsPackPrice,
			interval: BillingInterval.Month,
			billing_method: BillingMethod.Prepaid,
			billing_units: RELIST.wordsPackSize,
		},
	},
];

type PhasePlan = SetPlansParamsV0Input["phases"][number]["plans"][number];

/** The plans a set_plans request lists after each change, starting from Pro alone. */
export const relistPlans = ({
	catalog,
	change,
}: {
	catalog: RelistCatalog;
	change: RelistChange;
}): PhasePlan[] => {
	const pro: PhasePlan = {
		plan_id: catalog.pro.id,
		feature_quantities: wordsQuantity(RELIST.wordsQuantity),
	};
	switch (change) {
		case "unchanged":
			return [pro];
		case "base_price":
			return [
				{
					...pro,
					customize: {
						price: {
							amount: RELIST.changedProPrice,
							interval: BillingInterval.Month,
						},
					},
				},
			];
		case "usage_price":
			return [
				{
					...pro,
					customize: {
						items: proItemsWithUsagePrice(RELIST.changedUnitPrice),
					},
				},
			];
		case "prepaid_quantity":
			return [
				{
					...pro,
					feature_quantities: wordsQuantity(RELIST.changedWordsQuantity),
				},
			];
		case "swap":
			return [{ plan_id: catalog.premium.id }];
		case "drop":
			return [{ plan_id: catalog.addOn.id }];
		case "add":
			return [pro, { plan_id: catalog.addOn.id }];
	}
};

/** Clock-relative labels so two runs on different clocks compare equal. */
export type RelistDate =
	| "period_start"
	| "change"
	| "custom_anchor"
	| "period_start+1mo"
	| "change+1mo"
	| "custom_anchor+1mo"
	| string;

type InvoiceSummary = { total: number; messages: number[] };

export type RelistObservation = {
	preview: {
		total: number;
		lines: string[];
		nextCycle: { startsAt: RelistDate; total: number } | null;
	};
	execute: InvoiceSummary[];
	subscription: {
		status: string;
		anchor: RelistDate;
		periodEnd: RelistDate;
		cancelAtPeriodEnd: boolean;
		licensed: string[];
		metered: number;
	} | null;
	balance: { messagesUsage: number; messagesRemaining: number };
	atAnchor: InvoiceSummary[];
	renewal: InvoiceSummary[];
};

export type RelistStateSetup = (args: {
	scenario: RelistScenario;
}) => Promise<{ periodStartMs: number }>;

export type RelistScenario = Awaited<ReturnType<typeof initRelistScenario>>;

const initRelistScenario = async ({
	customerId,
	entity,
	trialDays,
}: {
	customerId: string;
	entity: boolean;
	trialDays?: number;
}) => {
	const catalog = relistCatalog({ trialDays });
	const scenario = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [catalog.pro, catalog.premium, catalog.addOn] }),
			...(entity
				? [s.entities({ count: 1, featureId: TestFeature.Users })]
				: []),
		],
		actions: [],
	});
	const clockStartMs =
		(
			await scenario.ctx.stripeCli.testHelpers.testClocks.retrieve(
				scenario.testClockId!,
			)
		).frozen_time * 1000;
	return {
		...scenario,
		catalog,
		entityId: entity ? scenario.entities[0]!.id : undefined,
		clockStartMs,
	};
};

const messagesAmounts = (
	lines: { description: string | null; amount: number }[],
) =>
	lines
		.filter(
			(line) => /messages/i.test(line.description ?? "") && line.amount !== 0,
		)
		.map((line) => line.amount / 100)
		.sort((a, b) => a - b);

const summarize = (invoice: Stripe.Invoice): InvoiceSummary => ({
	total: invoice.total / 100,
	messages: messagesAmounts(invoice.lines.data),
});

export const listStripeInvoices = async ({
	stripeCli,
	stripeCustomerId,
}: {
	stripeCli: Stripe;
	stripeCustomerId: string;
}) =>
	(
		await stripeCli.invoices.list({
			customer: stripeCustomerId,
			limit: 100,
			expand: ["data.lines"],
		})
	).data.reverse();

const liveSubscriptions = async ({
	stripeCli,
	stripeCustomerId,
}: {
	stripeCli: Stripe;
	stripeCustomerId: string;
}) =>
	(
		await stripeCli.subscriptions.list({
			customer: stripeCustomerId,
			status: "all",
			expand: ["data.items.data.price"],
		})
	).data.filter(
		(sub) => !["canceled", "incomplete_expired"].includes(sub.status),
	);

/** Advances onto an invoice date, lets Autumn's invoice.created work land, then finalizes. */
const advanceThroughInvoiceAt = async ({
	stripeCli,
	testClockId,
	atMs,
}: {
	stripeCli: Stripe;
	testClockId: string;
	atMs: number;
}) => {
	await advanceStripeTestClock({
		stripeCli,
		testClockId,
		targetSeconds: Math.floor(atMs / 1000),
		minimumWaitMs: 50_000,
	});
	await advanceStripeTestClock({
		stripeCli,
		testClockId,
		targetSeconds: Math.floor(
			addHours(atMs, hoursToFinalizeInvoice).getTime() / 1000,
		),
		minimumWaitMs: 30_000,
	});
};

/**
 * One end-to-end set_plans re-list: set up the customer state, track 150 messages, change the plan on
 * day 10 of the period, then follow the Stripe clock through the custom anchor (if any) and the renewal.
 */
export const runRelistCase = async ({
	customerId,
	setupState,
	change,
	anchor,
	proration,
	entity = false,
	trialDays,
	extraParams,
}: {
	customerId: string;
	setupState: RelistStateSetup;
	change: RelistChange;
	anchor: RelistAnchor;
	proration: RelistProration;
	entity?: boolean;
	trialDays?: number;
	extraParams?: Partial<SetPlansParamsV0Input>;
}) => {
	const scenario = await initRelistScenario({ customerId, entity, trialDays });
	const { autumnV1, autumnV2_4, ctx, testClockId, entityId, catalog } =
		scenario;
	const stripeCli = ctx.stripeCli;

	const { periodStartMs } = await setupState({ scenario });
	await autumnV1.track(
		{
			customer_id: customerId,
			entity_id: entityId,
			feature_id: TestFeature.Messages,
			value: RELIST.tracked,
		},
		{ timeout: 2000 },
	);

	const changeAtMs = addDays(periodStartMs, RELIST.changeAfterDays).getTime();
	const customAnchorMs = addDays(
		periodStartMs,
		RELIST.customAnchorAfterDays,
	).getTime();
	const currentClockMs =
		(await stripeCli.testHelpers.testClocks.retrieve(testClockId!))
			.frozen_time * 1000;
	if (changeAtMs > currentClockMs) {
		await advanceStripeTestClock({
			stripeCli,
			testClockId: testClockId!,
			targetSeconds: Math.floor(changeAtMs / 1000),
		});
	}

	const stripeCustomerId = (
		await CusService.getFull({ ctx, idOrInternalId: customerId })
	).processor!.id;
	const seen = new Set(
		(await listStripeInvoices({ stripeCli, stripeCustomerId })).map(
			(i) => i.id,
		),
	);
	const takeNewInvoices = async () => {
		const fresh = (
			await listStripeInvoices({ stripeCli, stripeCustomerId })
		).filter((invoice) => !seen.has(invoice.id));
		for (const invoice of fresh) seen.add(invoice.id);
		return fresh.map(summarize);
	};

	const params: SetPlansParamsV0Input = {
		customer_id: customerId,
		...(entityId && { entity_id: entityId }),
		...extraParams,
		phases: [
			{
				starts_at: "now",
				...(anchor === "now" && { billing_cycle_anchor: "phase_start" }),
				...(anchor === "custom" && { billing_cycle_anchor: customAnchorMs }),
				...(proration !== "prorate_immediately" && {
					proration_behavior: proration,
				}),
				plans: relistPlans({ catalog, change }),
			},
		],
	};

	const preview: SetPlansPreviewResponse =
		await autumnV2_4.billing.previewSetPlans(params);
	await autumnV2_4.billing.setPlans(params);
	const execute = await takeNewInvoices();

	const [sub] = await liveSubscriptions({ stripeCli, stripeCustomerId });
	const feature = (
		entityId
			? (await autumnV1.entities.get(customerId, entityId)).features
			: (await autumnV1.customers.get<ApiCustomerV3>(customerId)).features
	)[TestFeature.Messages] as ApiCusFeatureV3 | undefined;

	const dateOf = (ms: number): RelistDate => {
		const labels: [RelistDate, number][] = [
			["period_start", periodStartMs],
			["change", changeAtMs],
			["custom_anchor", customAnchorMs],
			["period_start+1mo", addMonths(periodStartMs, 1).getTime()],
			["change+1mo", addMonths(changeAtMs, 1).getTime()],
			["custom_anchor+1mo", addMonths(customAnchorMs, 1).getTime()],
		];
		const match = labels.find(([, at]) => Math.abs(at - ms) < 3_600_000);
		return match ? match[0] : new Date(ms).toISOString();
	};

	let atAnchor: InvoiceSummary[] = [];
	let nextCycleMs = sub
		? Math.max(...sub.items.data.map((item) => item.current_period_end)) * 1000
		: addMonths(changeAtMs, 1).getTime();
	if (sub && anchor === "custom") {
		await advanceThroughInvoiceAt({
			stripeCli,
			testClockId: testClockId!,
			atMs: customAnchorMs,
		});
		atAnchor = await takeNewInvoices();
		nextCycleMs = addMonths(customAnchorMs, 1).getTime();
	}
	if (sub) {
		await advanceToNextInvoice({
			stripeCli,
			testClockId: testClockId!,
			currentEpochMs: addMonths(nextCycleMs, -1).getTime(),
			withPause: true,
		});
	}
	const renewal = await takeNewInvoices();

	const observation: RelistObservation = {
		preview: {
			total: preview.total,
			lines: preview.line_items
				.map((line) => `${line.feature_id ?? "base"}:${line.total}`)
				.sort(),
			nextCycle: preview.next_cycle
				? {
						startsAt: dateOf(preview.next_cycle.starts_at),
						total: preview.next_cycle.total,
					}
				: null,
		},
		execute,
		subscription: sub
			? {
					status: sub.status,
					anchor: dateOf(sub.billing_cycle_anchor * 1000),
					periodEnd: dateOf(
						Math.max(...sub.items.data.map((item) => item.current_period_end)) *
							1000,
					),
					cancelAtPeriodEnd: sub.cancel_at_period_end,
					licensed: sub.items.data
						.filter((item) => item.price.recurring?.usage_type !== "metered")
						.map(
							(item) =>
								`${(item.price.unit_amount ?? 0) / 100}x${item.quantity ?? 0}`,
						)
						.sort(),
					metered: sub.items.data.filter(
						(item) => item.price.recurring?.usage_type === "metered",
					).length,
				}
			: null,
		balance: {
			messagesUsage: feature?.usage ?? 0,
			messagesRemaining: feature?.balance ?? 0,
		},
		atAnchor,
		renewal,
	};
	return { observation, periodStartMs, changeAtMs, customAnchorMs };
};

export type RelistRun = Awaited<ReturnType<typeof runRelistCase>>;

/** The same scenario twice on separate customers: the plan re-listed as-is, and with `change` applied. */
export const runRelistPair = async ({
	customerIdPrefix,
	change,
	...args
}: Omit<Parameters<typeof runRelistCase>[0], "customerId" | "change"> & {
	customerIdPrefix: string;
	change: Exclude<RelistChange, "unchanged">;
}) => {
	const [unchanged, changed] = await Promise.all([
		runRelistCase({
			...args,
			customerId: `${customerIdPrefix}-same`,
			change: "unchanged",
		}),
		runRelistCase({
			...args,
			customerId: `${customerIdPrefix}-${change}`,
			change,
		}),
	]);
	return { unchanged, changed };
};

/** Totals and usage lines across the timeline: what Stripe ground truth pins. */
export const relistBilling = (observation: RelistObservation) => {
	const sum = (invoices: InvoiceSummary[]) =>
		Math.round(
			invoices.reduce((total, invoice) => total + invoice.total, 0) * 100,
		) / 100;
	return {
		executeTotal: sum(observation.execute),
		executeMessages: observation.execute.flatMap((invoice) => invoice.messages),
		anchorTotal: sum(observation.atAnchor),
		anchorMessages: observation.atAnchor.flatMap((invoice) => invoice.messages),
		renewalTotal: sum(observation.renewal),
		renewalMessages: observation.renewal.flatMap((invoice) => invoice.messages),
		messagesUsage: observation.balance.messagesUsage,
	};
};

export type RelistBilling = ReturnType<typeof relistBilling>;

/** Autumn's own promises, independent of Stripe: the preview is what execute bills and what renews. */
export const relistPreviewMatchesExecution = (
	observation: RelistObservation,
) => ({
	previewTotal: observation.preview.total,
	nextCycleTotal: observation.preview.nextCycle?.total ?? null,
});

export const relistExecutionTotals = (observation: RelistObservation) => {
	const billing = relistBilling(observation);
	const firstCycle = observation.atAnchor.length
		? billing.anchorTotal
		: billing.renewalTotal;
	return {
		previewTotal: billing.executeTotal,
		nextCycleTotal: observation.preview.nextCycle ? firstCycle : null,
	};
};
