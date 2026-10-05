/** A catalog trial is not part of a plan instance's identity: re-saving rows that were never granted it changes nothing. */

import { describe, expect, test } from "bun:test";
import {
	CusProductStatus,
	type FreeTrial,
	FreeTrialDuration,
	type FullCusProduct,
	type FullProduct,
	ms,
} from "@autumn/shared";
import chalk from "chalk";
import { setupSetPlansTimeline } from "@/internal/billing/v2/actions/setPlans/setup/setupSetPlansTimeline";
import {
	customerProductToInstanceConfig,
	requestedPlanToInstanceConfig,
} from "@/internal/billing/v2/actions/setPlans/timeline/instanceConfig/instanceConfigs";
import { instanceConfigsMatch } from "@/internal/billing/v2/actions/setPlans/timeline/instanceConfig/instanceConfigsMatch";
import {
	buildContext,
	ctx,
	describeOperations,
	NOW,
	PHASE_B,
	paidProduct,
	running,
} from "./setPlansContextFixtures";

const catalogTrial = ({ product }: { product: FullProduct }): FreeTrial => ({
	id: `trial_${product.id}`,
	duration: FreeTrialDuration.Day,
	length: 14,
	unique_fingerprint: false,
	created_at: NOW - ms.days(60),
	internal_product_id: product.internal_id,
	is_custom: false,
	card_required: true,
	on_end: null,
});

const withCatalogTrial = (product: FullProduct): FullProduct => ({
	...product,
	free_trial: catalogTrial({ product }),
});

const proTrial = withCatalogTrial(paidProduct({ id: "pro-trial" }));
const premium = withCatalogTrial(paidProduct({ id: "premium" }));

const rowWithoutGrantedTrial = (
	input: Parameters<typeof running>[0],
): FullCusProduct => ({
	...running(input),
	free_trial_id: null,
	free_trial: null,
});

const liveProTrial = rowWithoutGrantedTrial({
	product: proTrial,
	endedAt: PHASE_B,
});
const scheduledPremium = rowWithoutGrantedTrial({
	product: premium,
	status: CusProductStatus.Scheduled,
	startsAt: PHASE_B,
});

const unchangedResave = () =>
	buildContext({
		existing: [liveProTrial, scheduledPremium],
		opening: [{ fullProduct: proTrial }],
		later: [{ startsAt: PHASE_B, plans: [{ fullProduct: premium }] }],
	});

const operationsFor = (billingContext: ReturnType<typeof unchangedResave>) =>
	describeOperations(
		setupSetPlansTimeline({
			ctx,
			billingContext,
			params: { undeclared_plans: "end" },
		}).diff,
	);

describe(chalk.yellowBright("set_plans catalog trial re-save"), () => {
	test("a row never granted its plan's catalog trial matches that plan", () => {
		expect(
			instanceConfigsMatch({
				features: ctx.features,
				first: customerProductToInstanceConfig({
					customerProduct: liveProTrial,
					now: NOW,
				}),
				second: requestedPlanToInstanceConfig({
					fullProduct: proTrial,
					featureQuantities: [],
					omittedLicenses: { type: "granted", licenses: [] },
					resetsBillingCycle: false,
					prorationBehavior: null,
				}),
			}),
		).toBe(true);
	});

	test("an unchanged re-save over a live and a scheduled trial plan changes nothing", () => {
		expect(operationsFor(unchangedResave())).toEqual([]);
	});

	test("an explicit free trial still recreates the live plan", () => {
		const billingContext = {
			...unchangedResave(),
			trialContext: {
				customFreeTrial: catalogTrial({ product: proTrial }),
			},
		} as ReturnType<typeof unchangedResave>;

		expect(operationsFor(billingContext)).toEqual([
			"expire:cus_prod_pro-trial",
			"insert:pro-trial@now",
		]);
	});
});
