import { expect, test } from "bun:test";
import {
	type ApiCustomerV3,
	type AttachPreviewResponse,
	type CreateScheduleParamsV0Input,
	FreeTrialDuration,
	ms,
} from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import {
	expectProductNotTrialing,
	expectProductTrialing,
} from "@tests/integration/billing/utils/expectCustomerProductTrialing";
import { expectPreviewNextCycleCorrect } from "@tests/integration/billing/utils/expectPreviewNextCycleCorrect";
import { expectStripeSubscriptionCorrect } from "@tests/integration/billing/utils/expectStripeSubCorrect";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

const previewCreateSchedule = async ({
	autumnV1,
	params,
}: {
	autumnV1: Awaited<ReturnType<typeof initScenario>>["autumnV1"];
	params: CreateScheduleParamsV0Input;
}): Promise<AttachPreviewResponse> =>
	await autumnV1.post("/billing.preview_create_schedule", params);

const immediateSchedule = ({
	customerId,
	plans,
	freeTrial,
}: {
	customerId: string;
	plans: CreateScheduleParamsV0Input["phases"][number]["plans"];
	freeTrial: CreateScheduleParamsV0Input["free_trial"];
}): CreateScheduleParamsV0Input => ({
	customer_id: customerId,
	preserve_add_ons: true,
	free_trial: freeTrial,
	phases: [{ starts_at: "now", plans }],
});

test.concurrent(
	`${chalk.yellowBright("create-schedule immediate multi-plan: applies one trial to every recurring plan")}`,
	async () => {
		const pro = products.pro({
			id: "shared-trial-pro",
			items: [items.monthlyMessages()],
		});
		const addon = products.recurringAddOn({
			id: "shared-trial-addon",
			items: [items.monthlyWords()],
		});
		const { customerId, autumnV1, ctx, advancedTo } = await initScenario({
			customerId: "cs-immediate-shared-trial",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, addon] }),
			],
			actions: [],
		});
		const params = immediateSchedule({
			customerId,
			plans: [{ plan_id: pro.id }, { plan_id: addon.id }],
			freeTrial: {
				duration_length: 14,
				duration_type: FreeTrialDuration.Day,
			},
		});

		const preview = await previewCreateSchedule({ autumnV1, params });
		expect(preview.total).toBe(0);
		expectPreviewNextCycleCorrect({
			preview,
			startsAt: advancedTo + ms.days(14),
			total: 40,
		});
		await autumnV1.billing.createSchedule(params);

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		const trialEnds = await Promise.all(
			[pro.id, addon.id].map((productId) =>
				expectProductTrialing({
					customer,
					productId,
					trialEndsAt: advancedTo + ms.days(14),
				}),
			),
		);
		expect(new Set(trialEnds).size).toBe(1);
		await expectCustomerInvoiceCorrect({ customer, count: 1, latestTotal: 0 });
		await expectStripeSubscriptionCorrect({
			ctx,
			customerId,
			options: { status: "trialing" },
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("create-schedule immediate multi-plan: clears an existing trial for every plan")}`,
	async () => {
		const pro = products.proWithTrial({
			id: "clear-trial-pro",
			items: [items.monthlyMessages()],
			trialDays: 14,
		});
		const addonA = products.recurringAddOn({
			id: "clear-trial-addon-a",
			items: [items.monthlyWords()],
		});
		const addonB = products.recurringAddOn({
			id: "clear-trial-addon-b",
			items: [items.monthlyUsers()],
		});
		const { customerId, autumnV1, ctx } = await initScenario({
			customerId: "cs-immediate-clear-trial",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, addonA, addonB] }),
			],
			actions: [s.billing.attach({ productId: pro.id })],
		});
		const params = immediateSchedule({
			customerId,
			plans: [
				{ plan_id: pro.id },
				{ plan_id: addonA.id },
				{ plan_id: addonB.id },
			],
			freeTrial: null,
		});

		expect((await previewCreateSchedule({ autumnV1, params })).total).toBe(60);
		await autumnV1.billing.createSchedule(params);

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectCustomerProducts({
			customer,
			active: [pro.id, addonA.id, addonB.id],
		});
		for (const productId of [pro.id, addonA.id, addonB.id]) {
			await expectProductNotTrialing({ customer, productId });
		}
		await expectCustomerInvoiceCorrect({ customer, count: 2, latestTotal: 60 });
		await expectStripeSubscriptionCorrect({
			ctx,
			customerId,
			options: { status: "active" },
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("create-schedule immediate multi-plan: replaces an existing trial for every plan")}`,
	async () => {
		const pro = products.proWithTrial({
			id: "replace-trial-pro",
			items: [items.monthlyMessages()],
			trialDays: 7,
		});
		const addonA = products.recurringAddOn({
			id: "replace-trial-addon-a",
			items: [items.monthlyWords()],
		});
		const addonB = products.recurringAddOn({
			id: "replace-trial-addon-b",
			items: [items.monthlyUsers()],
		});
		const { customerId, autumnV1, ctx, advancedTo } = await initScenario({
			customerId: "cs-immediate-replace-trial",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, addonA, addonB] }),
			],
			actions: [
				s.billing.attach({ productId: pro.id }),
				s.advanceTestClock({ days: 2 }),
			],
		});
		const params = immediateSchedule({
			customerId,
			plans: [
				{ plan_id: pro.id },
				{ plan_id: addonA.id },
				{ plan_id: addonB.id },
			],
			freeTrial: {
				duration_length: 14,
				duration_type: FreeTrialDuration.Day,
			},
		});

		const preview = await previewCreateSchedule({ autumnV1, params });
		expect(preview.total).toBe(0);
		expectPreviewNextCycleCorrect({
			preview,
			startsAt: advancedTo + ms.days(14),
			total: 60,
		});
		await autumnV1.billing.createSchedule(params);

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		const trialEnds = await Promise.all(
			[pro.id, addonA.id, addonB.id].map((productId) =>
				expectProductTrialing({
					customer,
					productId,
					trialEndsAt: advancedTo + ms.days(14),
				}),
			),
		);
		expect(new Set(trialEnds).size).toBe(1);
		await expectStripeSubscriptionCorrect({
			ctx,
			customerId,
			options: { status: "trialing" },
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("create-schedule immediate multi-plan: rejects revert trials without changing state")}`,
	async () => {
		const pro = products.pro({
			id: "revert-pro",
			items: [items.monthlyMessages()],
		});
		const premium = products.premium({
			id: "revert-premium",
			items: [items.monthlyMessages()],
		});
		const addon = products.recurringAddOn({
			id: "revert-addon",
			items: [items.monthlyWords()],
		});
		const { customerId, autumnV1 } = await initScenario({
			customerId: "cs-immediate-revert",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, premium, addon] }),
			],
			actions: [s.billing.attach({ productId: pro.id })],
		});
		const params = immediateSchedule({
			customerId,
			plans: [{ plan_id: premium.id }, { plan_id: addon.id }],
			freeTrial: {
				duration_length: 14,
				duration_type: FreeTrialDuration.Day,
				card_required: false,
				on_end: "revert",
			},
		});

		await expectAutumnError({
			errMessage: "Cannot use on_end: 'revert' with create_schedule.",
			func: () => autumnV1.billing.createSchedule(params),
		});

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectCustomerProducts({
			customer,
			active: [pro.id],
			notPresent: [premium.id, addon.id],
		});
		await expectCustomerInvoiceCorrect({ customer, count: 1, latestTotal: 20 });
	},
);
