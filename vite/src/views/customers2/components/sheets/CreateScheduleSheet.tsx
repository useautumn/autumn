import type {
	FullCustomer,
	FullCustomerSchedule,
	ProductItem,
	ProductV2,
} from "@autumn/shared";
import { CusProductStatus, mapToProductItems } from "@autumn/shared";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { CreateScheduleSheetContent } from "@/components/forms/create-schedule/components/CreateScheduleSheetContent";
import {
	CreateScheduleFormProvider,
	useCreateScheduleFormContext,
} from "@/components/forms/create-schedule/context/CreateScheduleFormProvider";
import {
	type CreateScheduleForm,
	EMPTY_SCHEDULE_PLAN,
} from "@/components/forms/create-schedule/createScheduleFormSchema";
import { useProductsQuery } from "@/hooks/queries/useProductsQuery";
import { useSheetStore } from "@/hooks/stores/useSheetStore";
import { backendToDisplayQuantity } from "@/utils/billing/prepaidQuantityUtils";
import { useCusQuery } from "@/views/customers/customer/hooks/useCusQuery";
import { AttachProductSheetV3 } from "@/views/customers2/components/sheets/AttachProductSheetV3";

function reconstructCustomItems({
	cusProduct,
	product,
}: {
	cusProduct: FullCustomer["customer_products"][number];
	product: ProductV2 | undefined;
}): ProductItem[] | null {
	const prices = cusProduct.customer_prices.map((cp) => cp.price);
	const entitlements = cusProduct.customer_entitlements.map(
		(ce) => ce.entitlement,
	);
	const features = cusProduct.customer_entitlements.map(
		(ce) => ce.entitlement.feature,
	);
	const customerItems = mapToProductItems({ prices, entitlements, features });
	const customerFeatureIds = new Set(
		customerItems.map((item) => item.feature_id).filter(Boolean),
	);
	const customerHasBasePrice = customerItems.some(
		(item) => !item.feature_id && item.price != null,
	);
	const missingProductItems =
		product?.items?.filter((item) => {
			if (!item.feature_id) return !customerHasBasePrice;
			return !customerFeatureIds.has(item.feature_id);
		}) ?? [];
	const items = [...customerItems, ...missingProductItems];
	return items.length > 0 ? items : null;
}

export function cusProductToPlan({
	cusProduct,
	products,
}: {
	cusProduct: FullCustomer["customer_products"][number];
	products: ProductV2[];
}) {
	const product = products.find((p) => p.id === cusProduct.product_id);
	const prepaidItems =
		product?.items?.filter(
			(item) => item.feature_id && item.usage_model === "prepaid",
		) ?? [];

	const prepaidOptions =
		prepaidItems.length > 0 && cusProduct.options?.length > 0
			? backendToDisplayQuantity({
					backendOptions: cusProduct.options,
					prepaidItems,
				})
			: {};

	const isCustom =
		cusProduct.is_custom ||
		cusProduct.customer_prices.some((cp) => cp.price.is_custom) ||
		cusProduct.customer_entitlements.some((ce) => ce.entitlement.is_custom);

	const items = isCustom
		? reconstructCustomItems({ cusProduct, product })
		: null;

	return {
		...EMPTY_SCHEDULE_PLAN,
		productId: cusProduct.product_id,
		prepaidOptions,
		items,
		isCustom,
	};
}

export function buildInitialValues({
	customer,
	schedule,
	products,
	entityId,
}: {
	customer: FullCustomer | undefined;
	schedule: FullCustomerSchedule | undefined;
	products: ProductV2[];
	entityId?: string;
}): CreateScheduleForm {
	if (schedule?.phases?.length) {
		return {
			phases: schedule.phases.map((phase) => ({
				startsAt: phase.starts_at,
				persistedStartsAt: phase.starts_at,
				plans: phase.customer_product_ids.map((cpId) => {
					const cusProduct = customer?.customer_products.find(
						(cp) => cp.id === cpId,
					);
					return cusProduct
						? cusProductToPlan({ cusProduct, products })
						: { ...EMPTY_SCHEDULE_PLAN };
				}),
			})),
		};
	}

	const activePlans =
		customer?.customer_products
			.filter((cp) => {
				if (cp.status !== CusProductStatus.Active || cp.canceled_at)
					return false;
				if (entityId) return cp.entity_id === entityId;
				return !cp.entity_id;
			})
			.map((cp) => cusProductToPlan({ cusProduct: cp, products })) ?? [];

	return {
		phases: [
			{
				startsAt: null,
				persistedStartsAt: undefined,
				plans:
					activePlans.length > 0 ? activePlans : [{ ...EMPTY_SCHEDULE_PLAN }],
			},
		],
	};
}

function CreateScheduleSheetBody() {
	const sheetType = useSheetStore((s) => s.type);
	const setSheet = useSheetStore((s) => s.setSheet);
	const { editingPlanValue, handlePlanEditSave, setEditingPlan } =
		useCreateScheduleFormContext();

	return sheetType === "attach-product-v2" ? (
		<AttachProductSheetV3
			scheduleEditPlan={editingPlanValue}
			onScheduleEditCancel={() => {
				setEditingPlan(null);
				setSheet({ type: "create-schedule" });
			}}
			onScheduleEditSave={(plan) => {
				handlePlanEditSave({ plan });
				setSheet({ type: "create-schedule" });
			}}
		/>
	) : (
		<CreateScheduleSheetContent />
	);
}

type EntityWithSchedule = FullCustomer["entities"][number] & {
	schedule?: FullCustomerSchedule;
};

export function getScheduleForScope({
	customer,
	entityId,
}: {
	customer: FullCustomer | undefined;
	entityId: string | undefined;
}): FullCustomerSchedule | undefined {
	if (!entityId) return customer?.schedule;
	const entity = (customer?.entities as EntityWithSchedule[] | undefined)?.find(
		(e) => e.id === entityId || e.internal_id === entityId,
	);
	return entity?.schedule;
}

export function CreateScheduleSheet() {
	const { closeSheet } = useSheetStore();
	const { customer, testClockFrozenTimeMs } = useCusQuery();
	const initialEntityId =
		new URLSearchParams(window.location.search).get("entity_id") ?? undefined;
	const [scopeEntityId, setScopeEntityId] = useState<string | undefined>(
		initialEntityId,
	);

	const { products } = useProductsQuery();

	const fullCustomer = customer as FullCustomer | undefined;
	const schedule = getScheduleForScope({
		customer: fullCustomer,
		entityId: scopeEntityId,
	});

	const initialValues = useMemo(
		() =>
			buildInitialValues({
				customer: fullCustomer,
				schedule,
				products,
				entityId: scopeEntityId,
			}),
		[fullCustomer, schedule, products, scopeEntityId],
	);

	const formKey = `${scopeEntityId ?? "customer"}-${schedule?.id ?? "new"}`;

	return (
		<CreateScheduleFormProvider
			key={formKey}
			customerId={customer?.id ?? customer?.internal_id ?? ""}
			entityId={scopeEntityId}
			initialValues={initialValues}
			nowMs={testClockFrozenTimeMs}
			onCheckoutRedirect={(checkoutUrl) => {
				navigator.clipboard.writeText(checkoutUrl);
				toast.success("Checkout URL copied to clipboard");
			}}
			onSuccess={closeSheet}
			onScopeChange={setScopeEntityId}
		>
			<CreateScheduleSheetBody />
		</CreateScheduleFormProvider>
	);
}
