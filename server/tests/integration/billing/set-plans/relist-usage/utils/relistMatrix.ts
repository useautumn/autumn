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
import { waitForStripeWebhook } from "@tests/utils/stripeUtils/waitForStripeWebhook";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import {
	addDays,
	addMonths,
	millisecondsToSeconds,
	secondsToMilliseconds,
} from "date-fns";
import { millisecondsInHour } from "date-fns/constants";
import type Stripe from "stripe";
import { getMiscRedis } from "@/external/redis/initRedis";
import { buildStripeWebhookEventKey } from "@/external/stripe/webhookMiddlewares/stripeIdempotencyMiddleware";
import { CusService } from "@/internal/customers/CusService";

const NO_INVOICE_GRACE_MS = 20_000;

import {
	type InvoiceSummary,
	RELIST,
	type RelistAnchor,
	type RelistChange,
	type RelistDate,
	type RelistObservation,
	type RelistProration,
} from "./relistTypes";

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

const messagesItem = (unitPrice: number) => ({
	feature_id: TestFeature.Messages,
	included: RELIST.includedMessages,
	price: {
		amount: unitPrice,
		interval: BillingInterval.Month,
		billing_method: BillingMethod.UsageBased,
		billing_units: 1,
	},
});

type PhasePlan = SetPlansParamsV0Input["phases"][number]["plans"][number];

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
						remove_items: [{ feature_id: TestFeature.Messages }],
						add_items: [messagesItem(RELIST.changedUnitPrice)],
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

export type RelistStateSetup = (args: { scenario: RelistScenario }) => Promise<{
	periodStartMs: number;
	params?: Partial<SetPlansParamsV0Input>;
}>;

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
	const clockStartMs = secondsToMilliseconds(
		(
			await scenario.ctx.stripeCli.testHelpers.testClocks.retrieve(
				scenario.testClockId!,
			)
		).frozen_time,
	);
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

/** Advances onto an invoice date and waits until Autumn has processed every invoice.created it produced. */
const advanceOntoInvoice = async ({
	scenario,
	stripeCustomerId,
	atMs,
}: {
	scenario: RelistScenario;
	stripeCustomerId: string;
	atMs: number;
}) => {
	const { ctx, testClockId } = scenario;
	const since = Date.now();
	await advanceStripeTestClock({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
		targetSeconds: millisecondsToSeconds(atMs),
	});
	await waitForStripeWebhook({
		stripeCli: ctx.stripeCli,
		env: ctx.env,
		types: ["invoice.created"],
		since,
		customerStripeId: stripeCustomerId,
		until: async () => {
			const events = (
				await ctx.stripeCli.events.list({
					type: "invoice.created",
					created: { gte: millisecondsToSeconds(since) - 5 },
					limit: 100,
				})
			).data.filter(
				(event) =>
					(event.data.object as Stripe.Invoice).customer === stripeCustomerId,
			);
			// A sub without a metered or changed item can cross an anchor with no invoice at all.
			if (events.length === 0) return Date.now() - since > NO_INVOICE_GRACE_MS;
			const statuses = await Promise.all(
				events.map((event) =>
					getMiscRedis().get(
						buildStripeWebhookEventKey({
							orgId: ctx.org.id,
							env: ctx.env,
							eventId: event.id,
						}),
					),
				),
			);
			return statuses.every((status) => status === "completed");
		},
	});
};

/** Tracks 150 messages, changes the plan on day 10, then follows the Stripe clock through any anchor and the renewal. */
export const runRelistCase = async ({
	customerId,
	setupState,
	change,
	anchor,
	proration,
	entity = false,
	trialDays,
	observeRenewal = true,
}: {
	customerId: string;
	setupState: RelistStateSetup;
	change: RelistChange;
	anchor: RelistAnchor;
	proration: RelistProration;
	entity?: boolean;
	trialDays?: number;
	observeRenewal?: boolean;
}) => {
	const scenario = await initRelistScenario({ customerId, entity, trialDays });
	const { autumnV1, autumnV2_4, ctx, testClockId, entityId, catalog } =
		scenario;
	const stripeCli = ctx.stripeCli;

	const { periodStartMs, params: stateParams } = await setupState({ scenario });
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
	const currentClockMs = secondsToMilliseconds(
		(await stripeCli.testHelpers.testClocks.retrieve(testClockId!)).frozen_time,
	);
	if (changeAtMs > currentClockMs) {
		await advanceStripeTestClock({
			stripeCli,
			testClockId: testClockId!,
			targetSeconds: millisecondsToSeconds(changeAtMs),
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
		...stateParams,
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

	// The sub carrying Pro's metered price, so a second sub (multi-sub state) is never mistaken for it.
	const subs = await liveSubscriptions({ stripeCli, stripeCustomerId });
	const sub =
		subs.find((candidate) =>
			candidate.items.data.some(
				(item) => item.price.recurring?.usage_type === "metered",
			),
		) ?? subs[0];
	const feature = (
		entityId
			? (await autumnV1.entities.get(customerId, entityId)).features
			: (await autumnV1.customers.get<ApiCustomerV3>(customerId)).features
	)[TestFeature.Messages] as ApiCusFeatureV3 | undefined;

	const msToRelistDate = (ms: number): RelistDate => {
		const labels: [RelistDate, number][] = [
			["period_start", periodStartMs],
			["change", changeAtMs],
			["custom_anchor", customAnchorMs],
			["period_start+1mo", addMonths(periodStartMs, 1).getTime()],
			["change+1mo", addMonths(changeAtMs, 1).getTime()],
			["custom_anchor+1mo", addMonths(customAnchorMs, 1).getTime()],
		];
		const match = labels.find(
			([, at]) => Math.abs(at - ms) < millisecondsInHour,
		);
		return match ? match[0] : new Date(ms).toISOString();
	};

	let atAnchor: InvoiceSummary[] = [];
	let nextCycleMs = sub
		? secondsToMilliseconds(
				Math.max(...sub.items.data.map((item) => item.current_period_end)),
			)
		: addMonths(changeAtMs, 1).getTime();
	if (sub && anchor === "custom") {
		await advanceOntoInvoice({
			scenario,
			stripeCustomerId,
			atMs: customAnchorMs,
		});
		atAnchor = await takeNewInvoices();
		nextCycleMs = addMonths(customAnchorMs, 1).getTime();
	}
	if (sub && observeRenewal) {
		await advanceOntoInvoice({ scenario, stripeCustomerId, atMs: nextCycleMs });
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
						startsAt: msToRelistDate(preview.next_cycle.starts_at),
						total: preview.next_cycle.total,
					}
				: null,
		},
		execute,
		subscription: sub
			? {
					status: sub.status,
					anchor: msToRelistDate(
						secondsToMilliseconds(sub.billing_cycle_anchor),
					),
					periodEnd: msToRelistDate(
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
