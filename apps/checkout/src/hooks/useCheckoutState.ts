import {
	type BillingResponse,
	CheckoutAction,
	type ConfirmCheckoutParams,
	type ConfirmCheckoutResponse,
	type GetCheckoutResponse,
	CheckoutStatus,
} from "@autumn/shared";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useDebouncedCallback } from "use-debounce";
import {
	useCheckout,
	useConfirmCheckout,
	usePreviewCheckout,
} from "@/hooks/useCheckout";
import type { CheckoutRouteMode } from "@/utils/checkoutRouteMode";
import { buildHeaderDescription } from "@/utils/buildHeaderDescription";

const SUCCESS_REDIRECT_DELAY_MS = 2000;

type CheckoutPreviewChange = GetCheckoutResponse["preview"]["incoming"][number];

function haveMatchingQuantities({
	incoming,
	outgoing,
}: {
	incoming: CheckoutPreviewChange;
	outgoing: CheckoutPreviewChange;
}) {
	if (incoming.feature_quantities.length !== outgoing.feature_quantities.length) {
		return false;
	}

	const outgoingQuantities = new Map(
		outgoing.feature_quantities.map((featureQuantity) => [
			featureQuantity.feature_id,
			featureQuantity.quantity,
		]),
	);

	return incoming.feature_quantities.every(
		(featureQuantity) =>
			outgoingQuantities.get(featureQuantity.feature_id) ===
			featureQuantity.quantity,
	);
}

function buildFeatureQuantities(
	incoming: CheckoutPreviewChange[],
	quantities: Record<string, number>,
): { feature_id: string; quantity: number }[] {
	const featureQuantities: { feature_id: string; quantity: number }[] = [];

	for (const change of incoming) {
		for (const fq of change.feature_quantities) {
			const quantity = quantities[fq.feature_id] ?? fq.quantity;
			featureQuantities.push({
				feature_id: fq.feature_id,
				quantity,
			});
		}
	}

	return featureQuantities;
}

export function useCheckoutState({
	checkoutId,
	routeMode,
}: {
	checkoutId: string;
	routeMode: CheckoutRouteMode;
}) {
	// === Raw state ===
	const [confirmResult, setConfirmResult] =
		useState<ConfirmCheckoutResponse | null>(null);
	const [actionRequiredResponse, setActionRequiredResponse] =
		useState<BillingResponse | null>(null);
	const [quantities, setQuantities] = useState<Record<string, number>>({});
	const [appliedPromotionCode, setAppliedPromotionCode] = useState<string | null>(
		null,
	);

	// === API hooks ===
	const { data: checkoutData, isLoading, error } = useCheckout({ checkoutId });
	const previewMutation = usePreviewCheckout({ checkoutId });
	const confirmMutation = useConfirmCheckout({ checkoutId });

	useEffect(() => {
		if (checkoutData?.status === CheckoutStatus.ActionRequired) {
			setActionRequiredResponse(checkoutData.response);
			return;
		}

		if (checkoutData) {
			setActionRequiredResponse(null);
		}
	}, [checkoutData]);

	useEffect(() => {
		if (!confirmResult?.success_url) {
			return;
		}

		const timeoutId = window.setTimeout(() => {
			window.location.assign(confirmResult.success_url);
		}, SUCCESS_REDIRECT_DELAY_MS);

		return () => {
			window.clearTimeout(timeoutId);
		};
	}, [confirmResult]);

	const buildCheckoutBody = useCallback(
		({
			nextQuantities = quantities,
			promotionCode = appliedPromotionCode,
		}: {
			nextQuantities?: Record<string, number>;
			promotionCode?: string | null;
		} = {}): ConfirmCheckoutParams => {
			const featureQuantities = checkoutData?.preview?.incoming
				? buildFeatureQuantities(checkoutData.preview.incoming, nextQuantities)
				: [];
			const code = promotionCode?.trim();

			return {
				feature_quantities: featureQuantities,
				...(code ? { discounts: [{ promotion_code: code }] } : {}),
			};
		},
		[appliedPromotionCode, checkoutData, quantities],
	);

	// === Debounced preview ===
	const debouncedPreview = useDebouncedCallback(
		(body: ConfirmCheckoutParams) => {
			previewMutation.mutate(body);
		},
		600,
	);

	// === Derived values ===
	const derivedState = useMemo(() => {
		const { action, env, preview, org, entity, status: checkoutStatus } =
			checkoutData ?? {};
		const adjustableFeatureIds = checkoutData?.adjustable_feature_ids ?? [];
		const incoming = preview?.incoming;
		const outgoing = preview?.outgoing;
		const isUpdateQuantityIntent =
			preview?.object === "update_subscription_preview" &&
			preview.intent === "update_quantity";
		const incomingChange = incoming?.[0];
		const matchingOutgoingChange = incomingChange
			? outgoing?.find((change) => change.plan_id === incomingChange.plan_id)
			: undefined;
		const isUnchangedQuantityUpdate =
			isUpdateQuantityIntent && incomingChange && matchingOutgoingChange
				? haveMatchingQuantities({
						incoming: incomingChange,
						outgoing: matchingOutgoingChange,
					})
				: false;
		const incomingPlan = incomingChange?.plan;
		const freeTrial = incomingPlan?.free_trial;
		const hasActiveTrial = !!freeTrial;
		const hasAdjustableFeatures = adjustableFeatureIds.length > 0;

		const headerDescription = buildHeaderDescription({
			preview,
			incoming,
			outgoing,
			entity: entity ?? undefined,
			freeTrial,
			hasActiveTrial,
		});

		return {
			action: action ?? CheckoutAction.Attach,
			routeMode,
			env,
			checkoutStatus: checkoutStatus ?? CheckoutStatus.Pending,
			preview,
			incoming,
			outgoing,
			org,
			entity,
			currency: preview?.currency ?? "usd",
			total: preview?.total ?? 0,
			primaryPlanName: incomingPlan?.name ?? incoming?.[0]?.plan_id ?? "Order",
			isSubscription: incoming?.some((c) => c.plan?.price?.interval) ?? false,
			freeTrial,
			hasActiveTrial,
			isSandbox: env === "sandbox",
			headerDescription,
			hasAdjustableFeatures,
			adjustableFeatureIds,
			isUnchangedQuantityUpdate,
		};
	}, [checkoutData, routeMode]);

	// === Callbacks ===
	const handleQuantityChange = useCallback(
		(featureId: string, quantity: number, _billingUnits: number) => {
			setQuantities((prev) => ({ ...prev, [featureId]: quantity }));

			if (checkoutData?.preview?.incoming) {
				const newQuantities = { ...quantities, [featureId]: quantity };
				debouncedPreview(
					buildCheckoutBody({
						nextQuantities: newQuantities,
					}),
				);
			}
		},
		[checkoutData, quantities, debouncedPreview, buildCheckoutBody],
	);

	const handleApplyDiscount = useCallback((promotionCode: string) => {
		const code = promotionCode.trim();
		if (!code) return Promise.resolve();

		return previewMutation
			.mutateAsync(buildCheckoutBody({ promotionCode: code }))
			.then(() => {
				setAppliedPromotionCode(code);
			});
	}, [buildCheckoutBody, previewMutation]);

	const handleClearDiscount = useCallback(() => {
		setAppliedPromotionCode(null);
		previewMutation.mutate(buildCheckoutBody({ promotionCode: null }));
	}, [buildCheckoutBody, previewMutation]);

	const handleConfirm = useCallback(() => {
		confirmMutation.mutate(buildCheckoutBody(), {
			onSuccess: (result) => {
				if (!result.success) {
					setActionRequiredResponse(result);
					return;
				}

				setConfirmResult(result);
			},
		});
	}, [buildCheckoutBody, confirmMutation]);

	const hasActionRequiredState = !!(
		actionRequiredResponse?.payment_url && actionRequiredResponse.required_action
	);

	// === Status flags ===
	const status = useMemo(
		() => ({
			isLoading,
			isUpdating: previewMutation.isPending,
			isConfirming: confirmMutation.isPending,
			error,
			confirmError: confirmMutation.error,
		}),
		[
			isLoading,
			previewMutation.isPending,
			confirmMutation.isPending,
			error,
			confirmMutation.error,
		],
	);

	return {
		checkoutId,
		...derivedState,
		quantities,
		appliedPromotionCode,
		actionRequiredResponse,
		hasActionRequiredState,
		confirmResult,
		status,
		handleQuantityChange,
		handleApplyDiscount,
		handleClearDiscount,
		handleConfirm,
	};
}

export type CheckoutState = ReturnType<typeof useCheckoutState>;
