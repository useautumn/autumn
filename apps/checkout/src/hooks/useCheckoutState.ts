import {
	type BillingResponse,
	CheckoutAction,
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

	// === Debounced preview ===
	const debouncedPreview = useDebouncedCallback(
		(feature_quantities: { feature_id: string; quantity: number }[]) => {
			previewMutation.mutate({ feature_quantities });
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
				const featureQuantities = buildFeatureQuantities(
					checkoutData.preview.incoming,
					newQuantities,
				);
				debouncedPreview(featureQuantities);
			}
		},
		[checkoutData, quantities, debouncedPreview],
	);

	const handleConfirm = useCallback(() => {
		const featureQuantities = checkoutData?.preview?.incoming
			? buildFeatureQuantities(checkoutData.preview.incoming, quantities)
			: [];

		confirmMutation.mutate({ feature_quantities: featureQuantities }, {
			onSuccess: (result) => {
				if (!result.success) {
					setActionRequiredResponse(result);
					return;
				}

				setConfirmResult(result);
			},
		});
	}, [checkoutData, confirmMutation, quantities]);

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
		actionRequiredResponse,
		hasActionRequiredState,
		confirmResult,
		status,
		handleQuantityChange,
		handleConfirm,
	};
}

export type CheckoutState = ReturnType<typeof useCheckoutState>;
