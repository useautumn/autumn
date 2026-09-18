import {
	FeatureType,
	type FullCusEntWithFullCusProduct,
	type FullSubject,
	isContUseFeature,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { BalanceWorkerUnsupportedError } from "./balanceWorkerErrors.js";

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
		feature.type !== FeatureType.Metered &&
		feature.type !== FeatureType.CreditSystem
	)
		reason = "feature_type_not_supported";
	else if (isContUseFeature({ feature }))
		reason = "continuous_usage_not_supported";
	else if (
		customerEntitlement.is_pooled_balance ||
		entitlement.pooled ||
		customerEntitlement.pooled_balance_id ||
		customerEntitlement.pooled_contribution_id
	)
		reason = "pooled_balance_not_supported";
	else if (customerProduct?.customer_license_link_id)
		reason = "license_not_supported";
	else if (customerEntitlement.replaceables.length)
		reason = "replaceables_not_supported";
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
