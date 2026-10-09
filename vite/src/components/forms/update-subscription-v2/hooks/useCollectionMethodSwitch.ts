import {
	CollectionMethod,
	type InvoicePaymentMethod,
	LATEST_VERSION,
	type UpdateSubscriptionV1ParamsInput,
} from "@autumn/shared";
import { useState } from "react";
import { useBillingMutation } from "@/components/forms/shared/hooks/useBillingMutation";
import { useOrgPaymentMethodTypes } from "@/components/forms/shared/hooks/useOrgPaymentMethodTypes";
import { BILLING_OPERATIONS } from "@/components/forms/shared/utils/billingOperations";
import { resolveNetTermsDays } from "@/components/forms/shared/utils/resolveNetTermsDays";
import { useOrg } from "@/hooks/common/useOrg";
import { useStripeSubscriptionQuery } from "@/hooks/queries/useStripeSubscriptionQuery";
import { useCustomerObjectQuery } from "@/views/customers2/customer/hooks/useCustomerObjectQuery";
import type { UpdateSubscriptionFormContext } from "../context/UpdateSubscriptionFormProvider";

const sameTypes = (a: InvoicePaymentMethod[], b: InvoicePaymentMethod[]) =>
	a.length === b.length && a.every((type) => b.includes(type));

/** Collection method edits, sent as a V1 billing.update whose only change is invoice_mode. */
export function useCollectionMethodSwitch({
	formContext,
	hasOtherChanges,
	onApplied,
	onSuccess,
}: {
	formContext: UpdateSubscriptionFormContext;
	hasOtherChanges: boolean;
	onApplied?: () => void;
	onSuccess?: () => void;
}) {
	const { customerId, product, entityId, customerProduct } = formContext;
	const { org } = useOrg({ skipSandbox: false });
	const orgPaymentMethodTypes = useOrgPaymentMethodTypes();

	const [target, setTarget] = useState<CollectionMethod | null>(null);
	const [netTermsDays, setNetTermsDays] = useState<number | null>(null);
	const [paymentMethodTypes, setPaymentMethodTypes] = useState<
		InvoicePaymentMethod[] | null
	>(null);
	const [applyToAutoTopups, setApplyToAutoTopups] = useState(true);

	const { data: stripeSubscription } = useStripeSubscriptionQuery({
		stripeSubscriptionId: customerProduct.subscription_ids?.[0],
	});
	const { data: customerObject, isSuccess: customerLoaded } =
		useCustomerObjectQuery({
			customerId,
			scopeEntityId: null,
			enabled: Boolean(stripeSubscription),
		});

	const current = stripeSubscription?.collection_method as
		| CollectionMethod
		| undefined;
	const currentlyInvoiced = current === CollectionMethod.SendInvoice;
	const currentPaymentMethodTypes = (stripeSubscription?.payment_settings
		?.payment_method_types ?? []) as InvoicePaymentMethod[];

	const locked = hasOtherChanges;
	const selected = (!locked && target) || current;
	const sendsInvoice = selected === CollectionMethod.SendInvoice;

	const defaultNetTermsDays = resolveNetTermsDays({
		netTermsDays: currentlyInvoiced
			? (stripeSubscription?.days_until_due ?? null)
			: null,
		defaultNetTermsDays:
			org?.config?.default_invoice_net_terms_days ?? undefined,
	});
	const defaultPaymentMethodTypes =
		currentlyInvoiced && currentPaymentMethodTypes.length > 0
			? currentPaymentMethodTypes
			: orgPaymentMethodTypes;
	const resolvedNetTermsDays = netTermsDays ?? defaultNetTermsDays;
	const resolvedPaymentMethodTypes =
		paymentMethodTypes ?? defaultPaymentMethodTypes;

	const switchesMethod = Boolean(selected && selected !== current);
	const editsInvoiceSettings =
		sendsInvoice &&
		(resolvedNetTermsDays !== defaultNetTermsDays ||
			!sameTypes(
				resolvedPaymentMethodTypes ?? [],
				defaultPaymentMethodTypes ?? [],
			));
	const isActive = !locked && (switchesMethod || editsInvoiceSettings);

	const paymentMethod = customerObject?.payment_method;
	const hasCard = Boolean(paymentMethod) && paymentMethod.type !== "custom";
	const missingCard =
		isActive &&
		selected === CollectionMethod.ChargeAutomatically &&
		customerLoaded &&
		!hasCard;

	const hasValidNetTerms = !sendsInvoice || resolvedNetTermsDays > 0;
	const requestBody: UpdateSubscriptionV1ParamsInput | null =
		isActive && hasValidNetTerms
			? {
					customer_id: customerId ?? "",
					plan_id: product?.id,
					entity_id: entityId,
					customer_product_id: customerProduct.id,
					invoice_mode: {
						enabled: sendsInvoice,
						...(sendsInvoice
							? {
									net_terms_days: resolvedNetTermsDays,
									payment_method_types: resolvedPaymentMethodTypes ?? undefined,
								}
							: {}),
						apply_to_auto_topups: applyToAutoTopups,
					},
				}
			: null;

	const mutation = useBillingMutation({
		customerId,
		path: BILLING_OPERATIONS.updateSubscription.path,
		buildRequestBody: () => requestBody,
		successMessage: !switchesMethod
			? "Invoice settings updated"
			: sendsInvoice
				? "Subscription switched to invoicing"
				: "Subscription switched to charging automatically",
		errorMessage: "Failed to switch collection method",
		apiVersion: LATEST_VERSION,
		onApplied,
		onSuccess,
	});

	return {
		current,
		selected,
		locked,
		sendsInvoice,
		switchesMethod,
		isActive,
		missingCard,
		requestBody,
		apiVersion: LATEST_VERSION,
		netTermsDays: resolvedNetTermsDays,
		paymentMethodTypes: resolvedPaymentMethodTypes,
		applyToAutoTopups,
		setTarget,
		setNetTermsDays,
		setPaymentMethodTypes,
		setApplyToAutoTopups,
		submit: () => mutation.mutate({}),
		isPending: mutation.isPending,
	};
}

export type CollectionMethodSwitch = ReturnType<
	typeof useCollectionMethodSwitch
>;
