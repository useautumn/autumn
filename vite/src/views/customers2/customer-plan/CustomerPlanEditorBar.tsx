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
import { pushPage } from "@/utils/genUtils";
import { useCusQuery } from "@/views/customers/customer/hooks/useCusQuery";
import { useCusProductQuery } from "@/views/customers/customer/product/hooks/useCusProductQuery";
import { PlanEditorBar } from "@/views/products/plan/components/PlanEditorBar";
import { DEFAULT_PRODUCT } from "@/views/products/plan/utils/defaultProduct";

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
	const setBaseProduct = useProductStore((s) => s.setBaseProduct);
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

	// Reset product store to default when component unmounts
	// useEffect(() => {
	// 	return () => {
	// 		setProduct(DEFAULT_PRODUCT);
	// 		setBaseProduct(null);
	// 	};
	// }, [setProduct, setBaseProduct]);

	const returnToCustomer = () => {
		// Open the appropriate sheet based on whether we have a subscription ID
		if (!queryStates.id) {
			// No subscription ID means we're attaching a new product
			setSheet({
				type: "attach-product",
				itemId: product.id,
				data: changesMade ? { customizedProduct: product } : null,
			});
		} else {
			// We have a subscription ID, so we're editing an existing subscription
			setSheet({
				type: changesMade ? "subscription-update-v2" : "subscription-detail",
				itemId: queryStates.id,
				data: changesMade ? { customizedProduct: product } : null,
			});
		}

		//navigate back to the customer plan page
		pushPage({
			path: `/customers/${customer?.id ?? customer?.internal_id}/`,
			navigate,
			preserveParams: false,
		});

		//clear query params to prevent stale product states
		setQueryStates(
			{ version: null, id: null, entity_id: queryStates.entity_id ?? null },
			{ history: "replace" },
		);
	};
	if (sheetType) return null;

	const handleSaveClicked = async () => {
		returnToCustomer();
	};

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

	const handleReturnWithoutSaving = () => {
		if (baseProduct) {
			setProduct(DEFAULT_PRODUCT);
			setBaseProduct(null);
		}
		returnToCustomer();
	};
	if (!changesMade) {
		return <GoBackBar handleReturnWithoutSaving={handleReturnWithoutSaving} />;
	}

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

const GoBackBar = ({
	handleReturnWithoutSaving,
}: {
	handleReturnWithoutSaving: () => void;
}) => {
	return (
		<PlanEditorBar>
			<Button variant="secondary" onClick={handleReturnWithoutSaving}>
				Return to Customer
			</Button>
		</PlanEditorBar>
	);
};
