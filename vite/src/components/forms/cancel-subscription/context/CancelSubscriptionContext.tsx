import { CusProductStatus, type FullCusProduct } from "@autumn/shared";
import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useMemo,
	useState,
} from "react";
import type {
	CancelActionValue,
	RefundBehaviorValue,
} from "@/components/forms/update-subscription-v2/updateSubscriptionFormSchema";
import { useCancelSubscriptionMutation } from "../hooks/useCancelSubscriptionMutation";
import {
	type UseCancelSubscriptionPreviewReturn,
	useCancelSubscriptionPreview,
} from "../hooks/useCancelSubscriptionPreview";

export interface CancelSubscriptionFormContext {
	customerId: string;
	productId: string;
	entityId?: string;
	customerProductId: string;
	customerProduct: FullCusProduct;
}

interface CancelSubscriptionContextValue {
	// Form context data
	formContext: CancelSubscriptionFormContext;

	// Form state
	cancelAction: CancelActionValue;
	setCancelAction: (value: CancelActionValue) => void;
	refundBehavior: RefundBehaviorValue;
	setRefundBehavior: (value: RefundBehaviorValue) => void;

	// Derived values
	canChooseCancelMode: boolean;
	showRefundToggle: boolean;
	isScheduled: boolean;
	isDefault: boolean;

	// Preview
	previewQuery: UseCancelSubscriptionPreviewReturn;

	// Mutation
	handleCancel: () => void;
	isPending: boolean;
}

const CancelSubscriptionReactContext =
	createContext<CancelSubscriptionContextValue | null>(null);

interface CancelSubscriptionProviderProps {
	formContext: CancelSubscriptionFormContext;
	onSuccess?: () => void;
	children: ReactNode;
}

export function CancelSubscriptionProvider({
	formContext,
	onSuccess,
	children,
}: CancelSubscriptionProviderProps) {
	const { customerProduct } = formContext;

	const isDefault = customerProduct.product.is_default;
	const isScheduled = customerProduct.status === CusProductStatus.Scheduled;
	const hasSubscription =
		customerProduct.subscription_ids &&
		customerProduct.subscription_ids.length > 0;

	// Scheduled, default, or products without subscription can only cancel immediately
	const canChooseCancelMode = !isScheduled && !isDefault && !!hasSubscription;

	const [cancelAction, setCancelAction] = useState<CancelActionValue>(
		canChooseCancelMode ? "cancel_end_of_cycle" : "cancel_immediately",
	);
	const [refundBehavior, setRefundBehavior] = useState<RefundBehaviorValue>(
		"grant_invoice_credits",
	);

	const previewQuery = useCancelSubscriptionPreview({
		customerId: formContext.customerId,
		productId: formContext.productId,
		entityId: formContext.entityId,
		customerProductId: formContext.customerProductId,
		cancelAction,
		refundBehavior,
		enabled: true,
	});

	const { handleCancel: executeCancelMutation, isPending } =
		useCancelSubscriptionMutation({
			customerId: formContext.customerId,
			productId: formContext.productId,
			entityId: formContext.entityId,
			customerProductId: formContext.customerProductId,
			onSuccess,
		});

	// Show refund behavior toggle only when:
	// 1. Cancel immediately is selected
	// 2. Preview total is negative (credit/refund due)
	const showRefundToggle =
		cancelAction === "cancel_immediately" &&
		!!previewQuery.data &&
		previewQuery.data.total < 0;

	const handleCancel = useCallback(() => {
		executeCancelMutation({
			cancelAction,
			refundBehavior: showRefundToggle ? refundBehavior : undefined,
		});
	}, [cancelAction, refundBehavior, showRefundToggle, executeCancelMutation]);

	const value = useMemo<CancelSubscriptionContextValue>(
		() => ({
			formContext,
			cancelAction,
			setCancelAction,
			refundBehavior,
			setRefundBehavior,
			canChooseCancelMode,
			showRefundToggle,
			isScheduled,
			isDefault,
			previewQuery,
			handleCancel,
			isPending,
		}),
		[
			formContext,
			cancelAction,
			refundBehavior,
			canChooseCancelMode,
			showRefundToggle,
			isScheduled,
			isDefault,
			previewQuery,
			handleCancel,
			isPending,
		],
	);

	return (
		<CancelSubscriptionReactContext.Provider value={value}>
			{children}
		</CancelSubscriptionReactContext.Provider>
	);
}

export function useCancelSubscriptionContext(): CancelSubscriptionContextValue {
	const context = useContext(CancelSubscriptionReactContext);
	if (!context) {
		throw new Error(
			"useCancelSubscriptionContext must be used within CancelSubscriptionProvider",
		);
	}
	return context;
}
