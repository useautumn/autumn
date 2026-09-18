import type { ProductItem, ProductV2 } from "@autumn/shared";
import { useStore } from "@tanstack/react-form";
import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useMemo,
} from "react";
import type { LicenseCatalog } from "@/components/forms/shared";
import { fullPlanLicensesToPlanLicenses } from "@/hooks/queries/usePlanLicensesQuery";
import { useProductsQuery } from "@/hooks/queries/useProductsQuery";
import { useRewardsQuery } from "@/hooks/queries/useRewardsQuery";
import { useCusQuery } from "@/views/customers/customer/hooks/useCusQuery";
import { useCustomerContext } from "@/views/customers2/customer/CustomerContext";
import type { CreateInvoiceForm } from "../createInvoiceFormSchema";
import {
	type CreateInvoiceFormApi,
	useCreateInvoiceForm,
} from "../hooks/useCreateInvoiceForm";
import { useCreateInvoicePlanEditor } from "../hooks/useCreateInvoicePlanEditor";
import { useCreateInvoicePreview } from "../hooks/useCreateInvoicePreview";
import { useCreateInvoiceRequestBody } from "../hooks/useCreateInvoiceRequestBody";
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
	blockingReason: string | null;
	planEditor: ReturnType<typeof useCreateInvoicePlanEditor>;
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
	const { rewards } = useRewardsQuery();
	const { setIsInlineEditorOpen } = useCustomerContext();
	const form = useCreateInvoiceForm();
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

	const requestBody = useCreateInvoiceRequestBody({
		customerId,
		form: formValues,
		preview: true,
		catalogItemsByPlanId,
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
			blockingReason,
			planEditor,
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
			blockingReason,
			planEditor,
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
