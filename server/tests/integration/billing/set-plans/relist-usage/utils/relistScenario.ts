import {
	type ApiCusFeatureV3,
	type ApiCustomerV3,
	BillingInterval,
	BillingMethod,
	type SetPlansParamsV0Input,
	type SetPlansPreviewResponse,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { advanceStripeTestClock } from "@tests/utils/stripeUtils/testClock/advanceStripeTestClock";
import { advanceToNextInvoice } from "@tests/utils/testAttachUtils/testAttachUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import { addMonths } from "date-fns";
import type Stripe from "stripe";
import { CusService } from "@/internal/customers/CusService";

const DAY_MS = 86_400_000;
const CHANGE_AFTER_DAYS = 10;

export type RelistStart = "no_sub" | "live_sub";
export type RelistProration =
	| "prorate_immediately"
	| "none"
	| "bill_difference";
export type RelistAnchor = "unchanged" | "phase_start";

/** Plan shapes mirror handoffs/ATMN-746/stripe-relist-no-sub.md: Pro, and the prod case's usage-only plan. */
export const RELIST_SHAPES = {
	pro: {
		flatPrice: 20,
		includedUsage: 100,
		unitPrice: 0.1,
		changedUnitPrice: 0.15,
		tracked: 150,
	},
	usageOnly: {
		flatPrice: null,
		includedUsage: 0,
		unitPrice: 1,
		changedUnitPrice: 1.5,
		tracked: 100,
	},
} as const;

export type RelistShape = (typeof RELIST_SHAPES)[keyof typeof RELIST_SHAPES];

type InvoiceSummary = { total: number; messages: number[] };

/** Everything a re-list can change, with ids and clock-relative times normalised so two runs compare. */
/** A clock-relative date: the change (day 10), one month after it, or one month after the clock start. */
export type RelistDate = "change+1mo" | "start+1mo" | string;

export type RelistObservation = {
	preview: {
		total: number;
		messages: number[];
		nextCycle: { startsAt: RelistDate; total: number } | null;
	};
	executeInvoices: InvoiceSummary[];
	subscription: {
		status: string;
		anchor: "change" | "start" | "other";
		periodEnd: RelistDate;
		licensedAmounts: number[];
		meteredItems: number;
	} | null;
	balance: { usage: number; remaining: number };
	renewalInvoices: InvoiceSummary[];
};

const sumTotals = (invoices: InvoiceSummary[]) =>
	Math.round(invoices.reduce((sum, invoice) => sum + invoice.total, 0) * 100) /
	100;

/** Execute and renewal totals plus the usage lines, the amounts the matrix pins to Stripe's ground truth. */
export const relistBilling = (observation: RelistObservation) => ({
	preview: observation.preview,
	executeTotal: sumTotals(observation.executeInvoices),
	executeMessages: observation.executeInvoices.flatMap((i) => i.messages),
	subscription: observation.subscription && {
		anchor: observation.subscription.anchor,
		periodEnd: observation.subscription.periodEnd,
	},
	balance: observation.balance,
	renewalTotal: sumTotals(observation.renewalInvoices),
	renewalMessages: observation.renewalInvoices.flatMap((i) => i.messages),
});

export type RelistBilling = ReturnType<typeof relistBilling>;

const messagesAmounts = (
	lines: { description: string | null; amount: number }[],
) =>
	lines
		.filter(
			(line) => /messages/i.test(line.description ?? "") && line.amount !== 0,
		)
		.map((line) => line.amount / 100)
		.sort((a, b) => a - b);

const summarizeInvoice = (invoice: Stripe.Invoice): InvoiceSummary => ({
	total: invoice.total / 100,
	messages: messagesAmounts(invoice.lines.data),
});

const listInvoices = async ({
	stripeCli,
	stripeCustomerId,
}: {
	stripeCli: Stripe;
	stripeCustomerId: string;
}) => {
	const { data } = await stripeCli.invoices.list({
		customer: stripeCustomerId,
		limit: 100,
		expand: ["data.lines"],
	});
	return data.reverse();
};

/** Stripe's netted reset line: the extension days past the old period end, prorated over the new period. */
export const stripeResetExtension = ({
	amount,
	clockStartMs,
}: {
	amount: number;
	clockStartMs: number;
}) => {
	const changeAtMs = clockStartMs + CHANGE_AFTER_DAYS * DAY_MS;
	const oldEnd = addMonths(clockStartMs, 1).getTime();
	const newEnd = addMonths(changeAtMs, 1).getTime();
	return (
		Math.round((amount * (newEnd - oldEnd) * 100) / (newEnd - changeAtMs)) / 100
	);
};

const changedMessagesItem = (shape: RelistShape) => ({
	feature_id: TestFeature.Messages,
	included: shape.includedUsage,
	price: {
		amount: shape.changedUnitPrice,
		interval: BillingInterval.Month,
		billing_method: BillingMethod.UsageBased,
		billing_units: 1,
	},
});

/**
 * One re-list of the same plan, with or without a live Stripe sub: track usage on day 0, set_plans on
 * day 10 (price unchanged or changed), then advance past the renewal and observe what was billed.
 */
export const runRelist = async ({
	customerId,
	start,
	priceChanged,
	proration,
	anchor,
	shape = RELIST_SHAPES.pro,
	entityLevel = false,
}: {
	customerId: string;
	start: RelistStart;
	priceChanged: boolean;
	proration: RelistProration;
	anchor: RelistAnchor;
	shape?: RelistShape;
	entityLevel?: boolean;
}): Promise<{ observation: RelistObservation; clockStartMs: number }> => {
	const plan = products.base({
		id: "relist",
		items: [
			...(shape.flatPrice
				? [items.monthlyPrice({ price: shape.flatPrice })]
				: []),
			items.consumableMessages({
				includedUsage: shape.includedUsage,
				price: shape.unitPrice,
			}),
		],
	});

	const { autumnV1, autumnV2_4, ctx, testClockId, entities } =
		await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [plan] }),
				...(entityLevel
					? [s.entities({ count: 1, featureId: TestFeature.Users })]
					: []),
			],
			actions: [],
		});
	const entityId = entityLevel ? entities[0]!.id : undefined;
	const stripeCli = ctx.stripeCli;

	const clockStartMs =
		(await stripeCli.testHelpers.testClocks.retrieve(testClockId!))
			.frozen_time * 1000;

	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: plan.id,
		entity_id: entityId,
		...(start === "no_sub" && { no_billing_changes: true }),
	});
	await autumnV1.track(
		{
			customer_id: customerId,
			entity_id: entityId,
			feature_id: TestFeature.Messages,
			value: shape.tracked,
		},
		{ timeout: 2000 },
	);

	const changeAtMs = clockStartMs + CHANGE_AFTER_DAYS * DAY_MS;
	await advanceStripeTestClock({
		stripeCli,
		testClockId: testClockId!,
		targetSeconds: Math.floor(changeAtMs / 1000),
	});

	const fullCustomer = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
	});
	const stripeCustomerId = fullCustomer.processor!.id;
	const invoiceIdsBefore = new Set(
		(await listInvoices({ stripeCli, stripeCustomerId })).map((i) => i.id),
	);

	const params: SetPlansParamsV0Input = {
		customer_id: customerId,
		...(entityId && { entity_id: entityId }),
		phases: [
			{
				starts_at: "now",
				...(anchor === "phase_start" && {
					billing_cycle_anchor: "phase_start",
				}),
				...(proration !== "prorate_immediately" && {
					proration_behavior: proration,
				}),
				plans: [
					{
						plan_id: plan.id,
						...(priceChanged && {
							customize: { items: [changedMessagesItem(shape)] },
						}),
					},
				],
			},
		],
	};

	const preview: SetPlansPreviewResponse =
		await autumnV2_4.billing.previewSetPlans(params);
	await autumnV2_4.billing.setPlans(params);

	const invoicesAfterChange = await listInvoices({
		stripeCli,
		stripeCustomerId,
	});
	const executeInvoices = invoicesAfterChange.filter(
		(i) => !invoiceIdsBefore.has(i.id),
	);

	const subscriptions = (
		await stripeCli.subscriptions.list({
			customer: stripeCustomerId,
			status: "all",
			expand: ["data.items.data.price"],
		})
	).data.filter(
		(sub) => !["canceled", "incomplete_expired"].includes(sub.status),
	);
	const sub = subscriptions[0];
	const periodEndMs = sub
		? Math.max(...sub.items.data.map((i) => i.current_period_end)) * 1000
		: addMonths(changeAtMs, 1).getTime();

	const feature = entityId
		? (await autumnV1.entities.get(customerId, entityId)).features[
				TestFeature.Messages
			]
		: (await autumnV1.customers.get<ApiCustomerV3>(customerId)).features[
				TestFeature.Messages
			];

	await advanceToNextInvoice({
		stripeCli,
		testClockId: testClockId!,
		currentEpochMs: addMonths(periodEndMs, -1).getTime(),
	});
	const executeIds = new Set(executeInvoices.map((i) => i.id));
	const renewalInvoices = (
		await listInvoices({ stripeCli, stripeCustomerId })
	).filter((i) => !invoiceIdsBefore.has(i.id) && !executeIds.has(i.id));

	const dateOf = (ms: number): RelistDate => {
		if (Math.abs(ms - addMonths(changeAtMs, 1).getTime()) < 3_600_000)
			return "change+1mo";
		if (Math.abs(ms - addMonths(clockStartMs, 1).getTime()) < 3_600_000)
			return "start+1mo";
		return new Date(ms).toISOString();
	};

	const anchorOf = (anchorMs: number) => {
		if (Math.abs(anchorMs - changeAtMs) < 60_000) return "change" as const;
		if (Math.abs(anchorMs - clockStartMs) < 60_000) return "start" as const;
		return "other" as const;
	};

	const observation: RelistObservation = {
		preview: {
			total: preview.total,
			messages: preview.line_items
				.filter((line) => line.feature_id === TestFeature.Messages)
				.map((line) => line.total)
				.filter((total) => total !== 0)
				.sort((a, b) => a - b),
			nextCycle: preview.next_cycle
				? {
						startsAt: dateOf(preview.next_cycle.starts_at),
						total: preview.next_cycle.total,
					}
				: null,
		},
		executeInvoices: executeInvoices.map(summarizeInvoice),
		subscription: sub
			? {
					status: sub.status,
					anchor: anchorOf(sub.billing_cycle_anchor * 1000),
					periodEnd: dateOf(periodEndMs),
					licensedAmounts: sub.items.data
						.filter((i) => i.price.recurring?.usage_type === "licensed")
						.map((i) => (i.price.unit_amount ?? 0) / 100)
						.filter((amount) => amount !== 0)
						.sort((a, b) => a - b),
					meteredItems: sub.items.data.filter(
						(i) => i.price.recurring?.usage_type === "metered",
					).length,
				}
			: null,
		balance: {
			usage: (feature as ApiCusFeatureV3).usage ?? 0,
			remaining: (feature as ApiCusFeatureV3).balance ?? 0,
		},
		renewalInvoices: renewalInvoices.map(summarizeInvoice),
	};
	return { observation, clockStartMs };
};

/** Runs the same re-list with the price unchanged and changed, side by side on separate customers. */
export const runRelistPair = async ({
	customerIdPrefix,
	...args
}: Omit<Parameters<typeof runRelist>[0], "customerId" | "priceChanged"> & {
	customerIdPrefix: string;
}) => {
	const [unchanged, changed] = await Promise.all([
		runRelist({
			...args,
			customerId: `${customerIdPrefix}-same`,
			priceChanged: false,
		}),
		runRelist({
			...args,
			customerId: `${customerIdPrefix}-changed`,
			priceChanged: true,
		}),
	]);
	return { unchanged, changed };
};
