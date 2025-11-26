import { parseAsInteger, parseAsString, useQueryStates } from "nuqs";
import { useNavigate } from "react-router";
import { Button } from "@/components/v2/buttons/Button";
import { ShortcutButton } from "@/components/v2/buttons/ShortcutButton";
import {
	useHasChanges,
	useIsLatestVersion,
	useProductStore,
} from "@/hooks/stores/useProductStore";
import { useSheetStore } from "@/hooks/stores/useSheetStore";
import { useAttachProductStore } from "@/hooks/stores/useSubscriptionStore";
import { pushPage } from "@/utils/genUtils";
import { useCusQuery } from "@/views/customers/customer/hooks/useCusQuery";
import { useCusProductQuery } from "@/views/customers/customer/product/hooks/useCusProductQuery";
import { PlanEditorBar } from "@/views/products/plan/components/PlanEditorBar";

export const CustomerPlanEditorBar = () => {
	const navigate = useNavigate();
	const { setSheet } = useSheetStore();
	const product = useProductStore((s) => s.product);
	const setProduct = useProductStore((s) => s.setProduct);
	const baseProduct = useProductStore((s) => s.baseProduct);
	const { cusProduct, isLoading } = useCusProductQuery();
	const { customer } = useCusQuery();
	const hasChanges = useHasChanges();
	const isLatestVersion = useIsLatestVersion(product);
	const setCustomizedProduct = useAttachProductStore(
		(s) => s.setCustomizedProduct,
	);
	const { type: sheetType } = useSheetStore();

	const [queryStates, setQueryStates] = useQueryStates({
		id: parseAsString, // This is the original cusProduct.id
		version: parseAsInteger,
		entity_id: parseAsString,
	});

	const differentVersion =
		//diff version selected if its a update flow vs an attach flow
		(queryStates.id && !cusProduct) || (!queryStates.id && !isLatestVersion);

	const changesMade = hasChanges || differentVersion;

	//if no hasChanges, and version is the current cusProduct version, then return null

	const returnToCustomer = () => {
		// Open the appropriate sheet based on whether we have a subscription ID
		if (!queryStates.id) {
			// No subscription ID means we're attaching a new product
			setSheet({
				type: "attach-product",
				itemId: product.id, // Pass the product ID being customized
			});
		} else {
			// We have a subscription ID, so we're editing an existing subscription
			setSheet({
				type: changesMade ? "subscription-update" : "subscription-detail",
				itemId: queryStates.id,
			});
		}

		//navigate back to the customer plan page
		pushPage({
			path: `/customers/${customer?.id}/`,
			navigate,
			preserveParams: false,
		});

		//clear query params to prevent stale product states
		setQueryStates(
			{ version: null, id: null, entity_id: queryStates.entity_id ?? null },
			{ history: "replace" },
		);
	};

	if (!changesMade) {
		return <GoBackBar returnToCustomer={returnToCustomer} />;
	}

	// const selectedEntity = useSelectedEntity();

	const handleSaveClicked = async () => {
		setCustomizedProduct({
			product,
			customer_product_id: queryStates.id || null,
		});
		returnToCustomer();
	};

	if (sheetType) return null;
	if (isLoading) return null;

	// if (!hasChanges && activeVersion === product.version) {
	// 	return null;
	// }

	const handleDiscardClicked = () => {
		setQueryStates({ version: null });
		// Reset product to baseProduct
		if (baseProduct) {
			setProduct(baseProduct);
		}
	};

	return (
		<PlanEditorBar>
			<Button variant="secondary" onClick={handleDiscardClicked}>
				{hasChanges ? "Discard Changes" : "Back to current version"}
			</Button>
			<ShortcutButton
				metaShortcut="s"
				onClick={() => {
					handleSaveClicked();
				}}
			>
				{hasChanges ? "Save and Return" : "Use this version"}
			</ShortcutButton>
		</PlanEditorBar>
	);
};

const GoBackBar = ({ returnToCustomer }: { returnToCustomer: () => void }) => {
	return (
		<PlanEditorBar>
			<Button variant="secondary" onClick={returnToCustomer}>
				Return to Customer
			</Button>
		</PlanEditorBar>
	);
};
