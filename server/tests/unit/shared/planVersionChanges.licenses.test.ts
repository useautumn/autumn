import { describe, expect, test } from "bun:test";
import {
	AffectedResource,
	type ApiPlanExpandedV1,
	ApiVersion,
	ApiVersionClass,
	AppEnv,
	AttachAction,
	applyResponseVersionChanges,
	EligibilityStatus,
	type SharedContext,
} from "@autumn/shared";

const ctx = {} as SharedContext;

const buildPlan = (): ApiPlanExpandedV1 => ({
	id: "pro",
	name: "Pro Plan",
	description: null,
	group: null,
	version: 1,
	add_on: false,
	auto_enable: false,
	price: null,
	items: [],
	created_at: 1771513979217,
	env: AppEnv.Sandbox,
	archived: false,
	base_variant_id: null,
	config: { ignore_past_due: false },
	metadata: {},
	customer_eligibility: {
		attach_action: AttachAction.Upgrade,
		trial_available: true,
		status: EligibilityStatus.Active,
		canceling: false,
		trialing: false,
	},
	licenses: [
		{
			license_plan_id: "seat",
			version: 2,
			included: 5,
			prepaid_only: true,
		},
	],
});

const downgradePlan = ({ to }: { to: ApiVersion }) =>
	applyResponseVersionChanges<ApiPlanExpandedV1>({
		input: buildPlan(),
		targetVersion: new ApiVersionClass(to),
		resource: AffectedResource.Product,
		ctx,
	});

describe("plan response version changes: licenses", () => {
	test("V2.1 responses keep the plan's license links", () => {
		const plan = downgradePlan({ to: ApiVersion.V2_1 });

		expect(plan.licenses).toEqual([
			{
				license_plan_id: "seat",
				version: 2,
				included: 5,
				prepaid_only: true,
			},
		]);
	});

	test("V2.1 responses still strip V2.2 customer_eligibility fields", () => {
		const plan = downgradePlan({ to: ApiVersion.V2_1 });

		expect(plan.customer_eligibility?.attach_action).toBe(AttachAction.Upgrade);
		expect(plan.customer_eligibility?.trial_available).toBe(true);
		expect(plan.customer_eligibility?.status).toBeUndefined();
		expect(plan.customer_eligibility?.canceling).toBeUndefined();
		expect(plan.customer_eligibility?.trialing).toBeUndefined();
	});

	test("V2.2 responses keep the plan's license links", () => {
		const plan = downgradePlan({ to: ApiVersion.V2_2 });

		expect(plan.licenses).toHaveLength(1);
	});

	test("plans without licenses stay without the field at V2.1", () => {
		const { licenses: _licenses, ...planWithoutLicenses } = buildPlan();

		const plan = applyResponseVersionChanges<ApiPlanExpandedV1>({
			input: planWithoutLicenses,
			targetVersion: new ApiVersionClass(ApiVersion.V2_1),
			resource: AffectedResource.Product,
			ctx,
		});

		expect(plan.licenses).toBeUndefined();
	});
});
