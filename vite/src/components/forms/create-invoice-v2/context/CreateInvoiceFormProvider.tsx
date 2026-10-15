import {
	type FullCustomer,
	mapToProductItems,
	type ProductItem,
	type ProductV2,
} from "@autumn/shared";
import { useStore } from "@tanstack/react-form";
import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useMemo,
} from "react";
import type { LicenseCatalog } from "@/components/forms/shared";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { fullPlanLicensesToPlanLicenses } from "@/hooks/queries/usePlanLicensesQuery";
import { useProductsQuery } from "@/hooks/queries/useProductsQuery";
import { useRewardsQuery } from "@/hooks/queries/useRewardsQuery";
import { getBackendErr } from "@/utils/genUtils";
import { useCusQuery } from "@/views/customers/customer/hooks/useCusQuery";
import { useCustomerContext } from "@/views/customers2/customer/CustomerContext";
import type { CreateInvoiceForm } from "../createInvoiceFormSchema";
import {
	type CreateInvoiceFormApi,
	useCreateInvoiceForm,
} from "../hooks/useCreateInvoiceForm";
import { useCreateInvoicePlanEditor } from "../hooks/useCreateInvoicePlanEditor";
import { useCreateInvoicePlanHandlers } from "../hooks/useCreateInvoicePlanHandlers";
import { useCreateInvoicePreview } from "../hooks/useCreateInvoicePreview";
import {
	type LicenseItemsByPlanId,
	useCreateInvoiceRequestBody,
} from "../hooks/useCreateInvoiceRequestBody";
import {
	getInvoiceExistingPlans,
	type InvoiceExistingPlan,
} from "../utils/customerStatePlanToInvoicePlan";
import { findPlansOutsideInvoicePeriod } from "../utils/servicePeriod";
import { findBlockingDiscount } from "../utils/validateInvoiceDiscounts";

interface CreateInvoiceFormContextValue {
	form: CreateInvoiceFormApi;
	formValues: CreateInvoiceForm;
	customerId: string | undefined;
	products: ProductV2[];
	productsById: Map<string, ProductV2>;
	previewQuery: ReturnType<typeof useCreateInvoicePreview>;
	requestBody: ReturnType<typeof useCreateInvoiceRequestBody>;
	catalogItemsByPlanId: Map<string, ProductItem[] | undefined>;
	licenseCatalogByPlanId: Map<string, LicenseCatalog>;
	licenseItemsByPlanId: LicenseItemsByPlanId;
	blockingReason: string | null;
	planEditor: ReturnType<typeof useCreateInvoicePlanEditor>;
	planHandlers: ReturnType<typeof useCreateInvoicePlanHandlers>;
	/** The customer's active plans, offered by "Copy existing plans". */
	existingPlans: InvoiceExistingPlan[];
	/** Rows whose service period the server rejected as outside the invoice's. */
	planIdsOutsidePeriod: Set<string>;
}

const CreateInvoiceFormContext =
	createContext<CreateInvoiceFormContextValue | null>(null);

export function CreateInvoiceFormProvider({
	children,
}: {
	children: ReactNode;
}) {
	const { customer } = useCusQuery();
	const { products } = useProductsQuery();
	const { features } = useFeaturesQuery();
	const { rewards } = useRewardsQuery();
	const { setIsInlineEditorOpen, entityId: pageEntityId } =
		useCustomerContext();
	const form = useCreateInvoiceForm({ defaultEntityId: pageEntityId });
	const formValues = useStore(form.store, (state) => state.values);

	const customerId = customer?.id ?? customer?.internal_id;
	const productsById = useMemo(
		() => new Map((products ?? []).map((product) => [product.id, product])),
		[products],
	);
	const rewardsById = useMemo(
		() => new Map(rewards.map((reward) => [reward.id, reward])),
		[rewards],
	);

	const existingPlans = useMemo(
		() =>
			getInvoiceExistingPlans({
				customer: customer as FullCustomer | undefined,
				products: products ?? [],
			}),
		[customer, products],
	);
	const planHandlers = useCreateInvoicePlanHandlers({
		form,
		defaultEntityId: pageEntityId,
		existingPlans,
	});

	const catalogItemsByPlanId = useMemo(
		() =>
			new Map((products ?? []).map((product) => [product.id, product.items])),
		[products],
	);

	// The products list already carries each plan's license links and the
	// license plans themselves, so rows never wait on a per-plan fetch.
	const licenseCatalogByPlanId = useMemo(() => {
		const all = products ?? [];
		return new Map(
			all.flatMap((product) => {
				const links = fullPlanLicensesToPlanLicenses({
					parentPlanId: product.id,
					licenses: product.licenses ?? [],
				});
				return links.length > 0
					? [[product.id, { links, products: all }] as const]
					: [];
			}),
		);
	}, [products]);

	// Each link pins a license version, which may differ from the latest one in `products`.
	const licenseItemsByPlanId: LicenseItemsByPlanId = useMemo(
		() =>
			new Map(
				(products ?? []).map((product) => [
					product.id,
					new Map(
						(product.licenses ?? []).map((link) => [
							link.product.id,
							mapToProductItems({
								prices: link.product.prices,
								entitlements: link.product.entitlements,
								features,
							}),
						]),
					),
				]),
			),
		[products, features],
	);

	const requestBody = useCreateInvoiceRequestBody({
		customerId,
		form: formValues,
		preview: true,
		catalogItemsByPlanId,
		licenseItemsByPlanId,
	});
	const openInlineEditor = useCallback(
		() => setIsInlineEditorOpen(true),
		[setIsInlineEditorOpen],
	);
	const closeInlineEditor = useCallback(
		() => setIsInlineEditorOpen(false),
		[setIsInlineEditorOpen],
	);
	const planEditor = useCreateInvoicePlanEditor({
		form,
		formValues,
		productsById,
		onOpen: openInlineEditor,
		onClose: closeInlineEditor,
	});

	const blockingReason = findBlockingDiscount({
		form: formValues,
		rewardsById,
	});
	const previewQuery = useCreateInvoicePreview({
		requestBody,
		enabled: requestBody !== null && blockingReason === null,
	});

	const previewError = previewQuery.error
		? getBackendErr(previewQuery.error, "")
		: null;
	const planIdsOutsidePeriod = useMemo(
		() =>
			new Set(
				findPlansOutsideInvoicePeriod({
					errorMessage: previewError,
					plans: formValues.plans,
				}),
			),
		[previewError, formValues.plans],
	);

	const value = useMemo(
		() => ({
			form,
			formValues,
			customerId,
			products: products ?? [],
			productsById,
			previewQuery,
			requestBody,
			catalogItemsByPlanId,
			licenseCatalogByPlanId,
			licenseItemsByPlanId,
			blockingReason,
			planEditor,
			planHandlers,
			existingPlans,
			planIdsOutsidePeriod,
		}),
		[
			form,
			formValues,
			customerId,
			products,
			productsById,
			previewQuery,
			requestBody,
			catalogItemsByPlanId,
			licenseCatalogByPlanId,
			licenseItemsByPlanId,
			blockingReason,
			planEditor,
			planHandlers,
			existingPlans,
			planIdsOutsidePeriod,
		],
	);

	return (
		<CreateInvoiceFormContext.Provider value={value}>
			{children}
		</CreateInvoiceFormContext.Provider>
	);
}

export function useCreateInvoiceFormContext() {
	const context = useContext(CreateInvoiceFormContext);
	if (!context) {
		throw new Error(
			"useCreateInvoiceFormContext must be used within CreateInvoiceFormProvider",
		);
	}
	return context;
}
