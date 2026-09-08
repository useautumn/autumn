import {
	type CustomerMeteringState,
	createCustomerMeteringState,
	type DirectMeteredV1FeatureState,
} from "@autumn/balance-engine";
import {
	CusProductStatus,
	type FullSubject,
	fullSubjectToFullCustomer,
	getApiBalance,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { BalanceWorkerUnsupportedError } from "./balanceWorkerErrors.js";
import {
	hasMeteringBillingControls,
	validateMeteringEntitlement,
} from "./validateMeteringEntitlement.js";

export function fullSubjectToMeteringState({
	ctx,
	fullSubject,
	featureIds,
}: {
	ctx: AutumnContext;
	fullSubject: FullSubject;
	featureIds: readonly string[];
}): CustomerMeteringState {
	const { customer } = fullSubject;
	if (
		customer.org_id !== ctx.org.id ||
		customer.env !== ctx.env ||
		!customer.id ||
		fullSubject.customerId !== customer.id ||
		fullSubject.internalCustomerId !== customer.internal_id
	) {
		throw new BalanceWorkerUnsupportedError({ reason: "subject_mismatch" });
	}
	if (
		fullSubject.subjectType !== "customer" ||
		fullSubject.entity ||
		fullSubject.entityId ||
		fullSubject.internalEntityId
	) {
		throw new BalanceWorkerUnsupportedError({ reason: "entity_not_supported" });
	}
	if (
		featureIds.length === 0 ||
		new Set(featureIds).size !== featureIds.length
	) {
		throw new BalanceWorkerUnsupportedError({
			reason: "invalid_feature_selection",
		});
	}
	if (
		hasMeteringBillingControls({ controls: customer }) ||
		fullSubject.usage_windows?.length
	) {
		throw new BalanceWorkerUnsupportedError({
			reason: "billing_controls_not_supported",
		});
	}
	const customerEntitlements = [
		...fullSubject.customer_products
			.filter((product) =>
				[CusProductStatus.Active, CusProductStatus.PastDue].includes(
					product.status,
				),
			)
			.flatMap((customerProduct) =>
				customerProduct.customer_entitlements.map((entitlement) => ({
					...entitlement,
					customer_product: customerProduct,
				})),
			),
		...[
			...fullSubject.extra_customer_entitlements,
			...(fullSubject.pooled_customer_entitlements ?? []),
		].map((entitlement) => ({ ...entitlement, customer_product: null })),
	];
	const featureStates: [string, DirectMeteredV1FeatureState][] = [];
	for (const featureId of featureIds) {
		const selected = customerEntitlements.filter(
			(entitlement) => entitlement.entitlement.feature.id === featureId,
		);
		if (selected.length === 0)
			throw new BalanceWorkerUnsupportedError({ reason: "feature_not_found" });
		for (const entitlement of selected)
			validateMeteringEntitlement({
				ctx,
				fullSubject,
				customerEntitlement: entitlement,
			});
		if (selected.length !== 1)
			throw new BalanceWorkerUnsupportedError({
				reason: "multiple_customer_entitlements_not_supported",
			});
		const customerEntitlement = selected[0];
		const { data: balance } = getApiBalance({
			ctx: { ...ctx, expand: [] },
			fullCus: fullSubjectToFullCustomer({ fullSubject }),
			cusEnts: selected,
			feature: customerEntitlement.entitlement.feature,
		});
		const breakdown = balance.breakdown?.[0];
		if (
			!breakdown ||
			breakdown.prepaid_grant !== 0 ||
			breakdown.reset?.interval === "multiple"
		) {
			throw new BalanceWorkerUnsupportedError({
				reason: "balance_shape_not_supported",
			});
		}
		featureStates.push([
			featureId,
			{
				kind: "direct_metered_v1",
				customerEntitlements: [
					{
						id: customerEntitlement.id,
						externalId: customerEntitlement.external_id,
						balance: breakdown.remaining,
						usage: breakdown.usage,
						granted: balance.granted,
						planId: breakdown.plan_id,
						reset: breakdown.reset
							? {
									interval: breakdown.reset.interval,
									intervalCount: breakdown.reset.interval_count ?? 1,
									nextResetAt: breakdown.reset.resets_at,
								}
							: null,
						expiresAt: breakdown.expires_at,
					},
				],
			},
		]);
	}
	return createCustomerMeteringState({
		identity: { orgId: ctx.org.id, env: ctx.env, customerId: customer.id },
		featureStatesById: Object.fromEntries(featureStates),
	});
}
