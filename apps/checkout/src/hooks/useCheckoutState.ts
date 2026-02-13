import type { ConfirmCheckoutResponse } from "@autumn/shared";
import { useCallback, useMemo, useState } from "react";
import { useDebouncedCallback } from "use-debounce";
import {
	useCheckout,
	useConfirmCheckout,
	usePreviewCheckout,
} from "@/hooks/useCheckout";
import { buildHeaderDescription } from "@/utils/buildHeaderDescription";

function buildOptionsArray(
	incoming: { feature_quantities: { feature_id: string; quantity: number }[] }[],
	quantities: Record<string, number>,
): { feature_id: string; quantity: number }[] {
	const options: { feature_id: string; quantity: number }[] = [];

	for (const change of incoming) {
		for (const fq of change.feature_quantities) {
			const quantity = quantities[fq.feature_id] ?? fq.quantity;
			options.push({
				feature_id: fq.feature_id,
				quantity,
			});
		}
	}

	return options;
}

export function useCheckoutState({ checkoutId }: { checkoutId: string }) {
	// === Raw state ===
	const [confirmResult, setConfirmResult] =
		useState<ConfirmCheckoutResponse | null>(null);
	const [quantities, setQuantities] = useState<Record<string, number>>({});

	// === API hooks ===
	const { data: checkoutData, isLoading, error } = useCheckout({ checkoutId });
	const previewMutation = usePreviewCheckout({ checkoutId });
	const confirmMutation = useConfirmCheckout({ checkoutId });

	// === Debounced preview ===
	const debouncedPreview = useDebouncedCallback(
		(options: { feature_id: string; quantity: number }[]) => {
			previewMutation.mutate(options);
		},
		600,
	);

	// === Derived values ===
	const derivedState = useMemo(() => {
		const { env, preview, incoming, outgoing, org, entity } = checkoutData ?? {};
		const incomingPlan = incoming?.[0]?.plan;
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
			env,
			preview,
			incoming,
			outgoing,
			org,
			entity,
			currency: preview?.currency ?? "usd",
			total: preview?.total ?? 0,
			primaryPlanName: incomingPlan?.name || "Order",
			isSubscription: incoming?.some((c) => c.plan.price?.interval) ?? false,
			freeTrial,
			hasActiveTrial,
			isSandbox: env === "sandbox",
			headerDescription,
		};
	}, [checkoutData]);

	// === Callbacks ===
	const handleQuantityChange = useCallback(
		(featureId: string, quantity: number, _billingUnits: number) => {
			setQuantities((prev) => ({ ...prev, [featureId]: quantity }));

			if (checkoutData) {
				const newQuantities = { ...quantities, [featureId]: quantity };
				const options = buildOptionsArray(checkoutData.incoming, newQuantities);
				debouncedPreview(options);
			}
		},
		[checkoutData, quantities, debouncedPreview],
	);

	const handleConfirm = useCallback(() => {
		confirmMutation.mutate(undefined, {
			onSuccess: (result) => {
				setConfirmResult(result);
			},
		});
	}, [confirmMutation]);

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
		confirmResult,
		status,
		handleQuantityChange,
		handleConfirm,
	};
}

export type CheckoutState = ReturnType<typeof useCheckoutState>;
