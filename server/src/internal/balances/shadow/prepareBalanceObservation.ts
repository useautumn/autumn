import { randomUUID } from "node:crypto";
import type { FullCusEntWithFullCusProduct, FullSubject } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { BalanceWorkerUnsupportedError } from "../balanceWorker/balanceWorkerErrors.js";
import {
	hasMeteringBillingControls,
	validateMeteringEntitlement,
} from "../balanceWorker/validateMeteringEntitlement.js";
import type { DeductionOptions } from "../utils/types/deductionTypes.js";
import type { FeatureDeduction } from "../utils/types/featureDeduction.js";
import type {
	BalanceObservation,
	BalanceObservationContext,
} from "./balanceObservation.js";
import { reportBalanceObservationFailure } from "./handoffBalanceObservation.js";

function classifyOperation({
	deduction,
	options,
}: {
	deduction: FeatureDeduction;
	options: DeductionOptions;
}): BalanceObservation["kind"] {
	if ((deduction.unwindValue ?? 0) > 0) return "unwind";
	if (deduction.lockReceipt || deduction.lockReceiptKey) return "finalize";
	if (deduction.lock?.enabled) return "reserve";
	if (deduction.targetBalance != null) return "set";
	if (options.alterGrantedBalance) return "adjust";
	if (deduction.deduction < 0) return "refund";
	return "deduct";
}

function unsupportedReason({
	ctx,
	fullSubject,
	entityId,
	deduction,
	options,
	customerEntitlements,
}: {
	ctx: AutumnContext;
	fullSubject: FullSubject;
	entityId?: string;
	deduction: FeatureDeduction;
	options: DeductionOptions;
	customerEntitlements: FullCusEntWithFullCusProduct[];
}): string | null {
	if (
		entityId ||
		fullSubject.subjectType !== "customer" ||
		fullSubject.entityId ||
		fullSubject.internalEntityId
	)
		return "entity_not_supported";
	if (
		fullSubject.customer.org_id !== ctx.org.id ||
		fullSubject.customer.env !== ctx.env ||
		fullSubject.customer.id !== fullSubject.customerId ||
		fullSubject.customer.internal_id !== fullSubject.internalCustomerId
	)
		return "subject_mismatch";
	if (Object.keys(options.eventProperties ?? {}).length)
		return "properties_not_supported";
	if (deduction.tokens) return "tokens_not_supported";
	if (
		hasMeteringBillingControls({ controls: fullSubject.customer }) ||
		fullSubject.usage_windows?.length
	)
		return "billing_controls_not_supported";
	if (customerEntitlements.length !== 1) return "single_entitlement_required";
	try {
		validateMeteringEntitlement({
			ctx,
			fullSubject,
			customerEntitlement: customerEntitlements[0],
		});
	} catch (error) {
		if (
			error instanceof BalanceWorkerUnsupportedError &&
			error.data &&
			typeof error.data === "object" &&
			"reason" in error.data &&
			typeof error.data.reason === "string"
		)
			return error.data.reason;
		throw error;
	}
	return null;
}

export function prepareBalanceObservation({
	ctx,
	fullSubject,
	entityId,
	deduction,
	options,
	customerEntitlements,
}: {
	ctx: AutumnContext;
	fullSubject: FullSubject;
	entityId?: string;
	deduction: FeatureDeduction;
	options: DeductionOptions;
	customerEntitlements: FullCusEntWithFullCusProduct[];
}) {
	const capture = ctx.balanceObservationCapture;
	if (!capture) return undefined;
	const context: BalanceObservationContext = {
		orgId: ctx.org.id,
		env: ctx.env,
		customerId: fullSubject.customerId,
		featureId: deduction.feature.id,
		requestId: ctx.id,
	};
	try {
		const featureIds = capture.select(context);
		if (!featureIds?.size) return undefined;
		let kind: BalanceObservation["kind"] = classifyOperation({
			deduction,
			options,
		});
		let reason: string | null = null;
		if (!featureIds.has(deduction.feature.id)) {
			const affectsSelectedFeature = customerEntitlements.some((entitlement) =>
				featureIds.has(entitlement.entitlement.feature.id),
			);
			kind = affectsSelectedFeature ? "unsupported" : "skip";
			reason = affectsSelectedFeature
				? "excluded_operation_affects_selected_feature"
				: "feature_not_selected";
		} else if (kind === "deduct") {
			reason = unsupportedReason({
				ctx,
				fullSubject,
				entityId,
				deduction,
				options,
				customerEntitlements,
			});
			if (reason) kind = "unsupported";
		}
		return {
			capture,
			context,
			metadataKey: `{${fullSubject.customerId}}:${ctx.org.id}:${ctx.env}:balance_observation`,
			params: { incarnation: randomUUID(), request_id: ctx.id, kind, reason },
		};
	} catch {
		reportBalanceObservationFailure({
			capture,
			context,
			reason: "capture_policy_failed",
		});
		return undefined;
	}
}
