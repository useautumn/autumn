import {
	AffectedResource,
	type ApiBalanceV1,
	applyResponseVersionChanges,
	type CheckResponseV3,
	type Feature,
	type FullSubject,
	findFeatureById,
	fullSubjectToCustomerEntitlements,
	getApiBalanceV2,
	InsufficientBalanceError,
	type ParsedCheckParams,
	type TrackParams,
	UsageLimitExceededError,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { getTrackFeatureDeductions } from "../../track/utils/getFeatureDeductions.js";
import { runPostgresTrackV3 } from "../../track/v3/runPostgresTrackV3.js";

const isRefusedDeduction = (error: unknown): boolean =>
	error instanceof InsufficientBalanceError ||
	error instanceof UsageLimitExceededError;

/** The feature's balance as the subject holds it now; null when nothing funds it. */
const fullSubjectToApiBalance = ({
	ctx,
	fullSubject,
	feature,
}: {
	ctx: AutumnContext;
	fullSubject: FullSubject;
	feature: Feature;
}): ApiBalanceV1 | null => {
	const customerEntitlements = fullSubjectToCustomerEntitlements({
		fullSubject,
		featureIds: [feature.id],
	});
	if (customerEntitlements.length === 0) return null;
	return getApiBalanceV2({ ctx, fullSubject, customerEntitlements, feature })
		.data;
};

/**
 * A deducting check the worker refused for a v1 paid allocated grant: the same reject-mode track legacy
 * runs, on Postgres. Allowed iff it applied; a refused one reports the balance it was refused against.
 */
export async function runPostgresDeductingCheck({
	ctx,
	body,
	requiredBalance,
	fullSubject,
}: {
	ctx: AutumnContext;
	body: ParsedCheckParams;
	requiredBalance: number;
	fullSubject: FullSubject;
}): Promise<CheckResponseV3> {
	const feature = findFeatureById({
		features: ctx.features,
		featureId: body.feature_id ?? "",
		errorOnNotFound: true,
	});
	const trackBody: TrackParams = {
		customer_id: body.customer_id,
		entity_id: body.entity_id,
		feature_id: feature.id,
		value: requiredBalance,
		properties: body.properties,
		skip_event: body.skip_event,
		overage_behavior: "reject",
	};
	const featureDeductions = getTrackFeatureDeductions({
		ctx,
		featureId: feature.id,
		value: requiredBalance,
	}).map((deduction) => ({ ...deduction, enforceOverdueBlock: true }));

	let allowed = true;
	let balance: ApiBalanceV1 | null;
	try {
		const response = await runPostgresTrackV3({
			ctx,
			fullSubject,
			body: trackBody,
			featureDeductions,
		});
		balance = response.balance;
	} catch (error) {
		if (!isRefusedDeduction(error)) throw error;
		allowed = false;
		balance = fullSubjectToApiBalance({ ctx, fullSubject, feature });
	}

	return applyResponseVersionChanges<CheckResponseV3>({
		ctx,
		targetVersion: ctx.apiVersion,
		resource: AffectedResource.Check,
		input: {
			allowed,
			customer_id: body.customer_id,
			entity_id: body.entity_id ?? undefined,
			required_balance: requiredBalance,
			flag: null,
			balance,
		},
		legacyData: { noCusEnts: balance === null, featureToUse: feature },
	});
}
