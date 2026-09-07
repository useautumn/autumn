import {
	AllowanceType,
	CusProductStatus,
	type Customer,
	cusEntToCusPrice,
	FeatureType,
	type FullCusEntWithFullCusProduct,
	type FullSubject,
	isContUseFeature,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { getCreditSystemsFromFeature } from "@/internal/features/creditSystemUtils.js";
import { BalanceWorkerUnsupportedError } from "./balanceWorkerErrors.js";

export function hasMeteringBillingControls({
	controls,
}: {
	controls: Pick<
		Customer,
		| "usage_limits"
		| "spend_limits"
		| "auto_topups"
		| "usage_alerts"
		| "overage_allowed"
	>;
}): boolean {
	return Boolean(
		controls.usage_limits?.length ||
			controls.spend_limits?.length ||
			controls.auto_topups?.length ||
			controls.usage_alerts?.length ||
			controls.overage_allowed?.length,
	);
}

export function validateMeteringEntitlement({
	ctx,
	fullSubject,
	customerEntitlement,
}: {
	ctx: AutumnContext;
	fullSubject: FullSubject;
	customerEntitlement: FullCusEntWithFullCusProduct;
}): void {
	const { entitlement, customer_product: customerProduct } =
		customerEntitlement;
	const { feature } = entitlement;
	let reason: string | undefined;
	if (
		customerEntitlement.internal_customer_id !==
			fullSubject.internalCustomerId ||
		customerEntitlement.internal_feature_id !== feature.internal_id ||
		feature.org_id !== ctx.org.id ||
		feature.env !== ctx.env
	)
		reason = "subject_mismatch";
	else if (feature.type === FeatureType.Boolean)
		reason = "boolean_not_supported";
	else if (
		feature.type !== FeatureType.Metered ||
		getCreditSystemsFromFeature({
			featureId: feature.id,
			features: ctx.features,
		}).length > 0
	)
		reason = "credit_system_not_supported";
	else if (isContUseFeature({ feature }))
		reason = "continuous_usage_not_supported";
	else if (
		customerEntitlement.unlimited ||
		entitlement.allowance_type === AllowanceType.Unlimited
	)
		reason = "unlimited_not_supported";
	else if (
		customerEntitlement.is_pooled_balance ||
		entitlement.pooled ||
		customerEntitlement.pooled_balance_id ||
		customerEntitlement.pooled_contribution_id
	)
		reason = "pooled_balance_not_supported";
	else if (
		customerEntitlement.internal_entity_id ||
		entitlement.entity_feature_id ||
		Object.keys(customerEntitlement.entities ?? {}).length ||
		customerProduct?.internal_entity_id ||
		customerProduct?.customer_license_link_id
	)
		reason = "entity_not_supported";
	else if (customerEntitlement.usage_allowed) reason = "overage_not_supported";
	else if (entitlement.usage_limit != null)
		reason = "usage_limit_not_supported";
	else if (
		customerProduct &&
		hasMeteringBillingControls({ controls: customerProduct.product })
	)
		reason = "billing_controls_not_supported";
	else if (customerProduct?.status === CusProductStatus.PastDue)
		reason = "past_due_not_supported";
	else if (cusEntToCusPrice({ cusEnt: customerEntitlement }))
		reason = "priced_entitlement_not_supported";
	else if (
		customerEntitlement.rollovers.length ||
		entitlement.rollover ||
		entitlement.carry_from_previous
	)
		reason = "rollover_not_supported";
	else if (customerEntitlement.replaceables.length)
		reason = "replaceables_not_supported";
	else if (customerEntitlement.additional_balance !== 0)
		reason = "additional_balance_not_supported";
	else if (
		customerEntitlement.balance == null ||
		!Number.isFinite(customerEntitlement.balance)
	)
		reason = "balance_missing";
	else if (
		customerEntitlement.next_reset_at != null &&
		customerEntitlement.next_reset_at <= ctx.timestamp
	)
		reason = "reset_due";
	else if (
		customerEntitlement.expires_at != null &&
		customerEntitlement.expires_at <= ctx.timestamp
	)
		reason = "expired_entitlement";
	if (reason) throw new BalanceWorkerUnsupportedError({ reason });
}
