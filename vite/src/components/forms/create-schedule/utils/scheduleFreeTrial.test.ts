import { describe, expect, test } from "bun:test";
import {
	CusProductStatus,
	FreeTrialDuration,
	type FullCusProduct,
	type ProductV2,
} from "@autumn/shared";
import type { CustomerStatePhase } from "@/components/forms/customer-state/customerStateSchema";
import {
	DISABLED_FREE_TRIAL_FORM_VALUES,
	type FreeTrialFormValues,
} from "@/components/forms/shared/utils/freeTrialFormValues";
import { buildCreateScheduleRequestBody } from "../hooks/useCreateScheduleRequestBody";
import {
	type CurrentScheduleTrial,
	canScheduleFreeTrial,
	defaultScheduleTrialFormValues,
	findCatalogScheduleTrial,
	findCurrentScheduleTrial,
} from "./scheduleFreeTrial";

const NOW = Date.UTC(2027, 0, 1);
const DAY_MS = 24 * 60 * 60 * 1000;

const FOURTEEN_DAY_TRIAL: FreeTrialFormValues = {
	trialEnabled: true,
	trialLength: 14,
	trialDuration: FreeTrialDuration.Day,
	trialCardRequired: true,
};

const CURRENT_TRIAL: CurrentScheduleTrial = {
	trialEndsAt: NOW + 5 * DAY_MS,
	formValues: FOURTEEN_DAY_TRIAL,
};

const proPlan = { id: "pro", items: [] } as unknown as ProductV2;
const proWithTrial = {
	id: "pro",
	items: [],
	free_trial: {
		length: 7,
		duration: FreeTrialDuration.Day,
		card_required: true,
	},
} as unknown as ProductV2;

const phasesStarting = (
	startsAt: number | null,
	persistedStartsAt?: number,
): CustomerStatePhase[] => [
	{
		startsAt,
		...(persistedStartsAt !== undefined ? { persistedStartsAt } : {}),
		plans: [
			{
				productId: "pro",
				prepaidOptions: {},
				licenseQuantities: {},
				items: null,
				addLicenses: null,
				isCustom: false,
				entityId: null,
			},
		],
	},
];

const customerProduct = (overrides: Partial<FullCusProduct>): FullCusProduct =>
	({
		status: CusProductStatus.Active,
		product: { id: "pro" },
		trial_ends_at: null,
		free_trial: null,
		...overrides,
	}) as unknown as FullCusProduct;

const buildFreeTrialParam = ({
	freeTrial,
	currentTrial = null,
	phases = phasesStarting(null),
}: {
	freeTrial: FreeTrialFormValues;
	currentTrial?: CurrentScheduleTrial | null;
	phases?: CustomerStatePhase[];
}) =>
	buildCreateScheduleRequestBody({
		customerId: "cus_1",
		features: [],
		nowMs: NOW,
		phases,
		products: [proPlan],
		freeTrial,
		currentTrial,
	});

describe("schedule free_trial request mapping", () => {
	test("an enabled row sends the trial", () => {
		expect(
			buildFreeTrialParam({ freeTrial: FOURTEEN_DAY_TRIAL })?.free_trial,
		).toEqual({
			duration_length: 14,
			duration_type: FreeTrialDuration.Day,
			card_required: true,
		});
	});

	test("switching off a running trial sends null to end it", () => {
		const body = buildFreeTrialParam({
			freeTrial: DISABLED_FREE_TRIAL_FORM_VALUES,
			currentTrial: CURRENT_TRIAL,
		});
		expect(body).toHaveProperty("free_trial", null);
	});

	test("a disabled row without a running trial omits free_trial", () => {
		expect(
			buildFreeTrialParam({ freeTrial: DISABLED_FREE_TRIAL_FORM_VALUES }),
		).not.toHaveProperty("free_trial");
	});

	test("an untouched running trial is omitted so it carries on", () => {
		expect(
			buildFreeTrialParam({
				freeTrial: FOURTEEN_DAY_TRIAL,
				currentTrial: CURRENT_TRIAL,
			}),
		).not.toHaveProperty("free_trial");
	});

	test("an edited running trial is sent as a new trial", () => {
		expect(
			buildFreeTrialParam({
				freeTrial: { ...FOURTEEN_DAY_TRIAL, trialLength: 30 },
				currentTrial: CURRENT_TRIAL,
			})?.free_trial,
		).toMatchObject({ duration_length: 30 });
	});

	test("a backdated or future first phase never sends a trial", () => {
		for (const phases of [
			phasesStarting(NOW - DAY_MS),
			phasesStarting(NOW + DAY_MS, NOW + DAY_MS),
		]) {
			expect(
				buildFreeTrialParam({
					freeTrial: DISABLED_FREE_TRIAL_FORM_VALUES,
					currentTrial: CURRENT_TRIAL,
					phases,
				}),
			).not.toHaveProperty("free_trial");
		}
	});
});

describe("canScheduleFreeTrial", () => {
	test("allows a first phase starting now or an already started schedule", () => {
		expect(
			canScheduleFreeTrial({ phases: phasesStarting(null), nowMs: NOW }),
		).toBe(true);
		expect(
			canScheduleFreeTrial({
				phases: phasesStarting(NOW - DAY_MS, NOW - DAY_MS),
				nowMs: NOW,
			}),
		).toBe(true);
	});

	test("hides the trial for a backdated or future first phase", () => {
		expect(
			canScheduleFreeTrial({
				phases: phasesStarting(NOW - DAY_MS),
				nowMs: NOW,
			}),
		).toBe(false);
		expect(
			canScheduleFreeTrial({
				phases: phasesStarting(NOW + DAY_MS, NOW + DAY_MS),
				nowMs: NOW,
			}),
		).toBe(false);
	});
});

describe("initial trial row", () => {
	test("a trialing plan seeds the row with its trial", () => {
		const currentTrial = findCurrentScheduleTrial({
			customerProducts: [
				customerProduct({
					trial_ends_at: NOW + 5 * DAY_MS,
					free_trial: {
						length: 14,
						duration: FreeTrialDuration.Day,
						card_required: true,
					} as FullCusProduct["free_trial"],
				}),
			],
			nowMs: NOW,
		});

		expect(currentTrial).toEqual(CURRENT_TRIAL);
		expect(
			defaultScheduleTrialFormValues({ currentTrial, catalogFreeTrial: null }),
		).toEqual(FOURTEEN_DAY_TRIAL);
	});

	test("an ended trial is not current", () => {
		expect(
			findCurrentScheduleTrial({
				customerProducts: [customerProduct({ trial_ends_at: NOW - DAY_MS })],
				nowMs: NOW,
			}),
		).toBeNull();
	});

	test("a catalog trial set_plans would start seeds the row on", () => {
		const catalogFreeTrial = findCatalogScheduleTrial({
			phases: phasesStarting(null),
			products: [proWithTrial],
			customerProducts: [],
		});

		expect(
			defaultScheduleTrialFormValues({ currentTrial: null, catalogFreeTrial }),
		).toMatchObject({ trialEnabled: true, trialLength: 7 });
	});

	test("a plan the customer already had starts no catalog trial", () => {
		expect(
			findCatalogScheduleTrial({
				phases: phasesStarting(null),
				products: [proWithTrial],
				customerProducts: [customerProduct({})],
			}),
		).toBeNull();
		expect(
			defaultScheduleTrialFormValues({
				currentTrial: null,
				catalogFreeTrial: null,
			}),
		).toEqual(DISABLED_FREE_TRIAL_FORM_VALUES);
	});
});
