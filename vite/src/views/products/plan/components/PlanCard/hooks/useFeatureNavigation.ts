import { type ProductItem, productV2ToFeatureItems } from "@autumn/shared";
import { useCallback, useEffect, useState } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { getItemId } from "@/utils/product/productItemUtils";
import { useProductContext } from "@/views/products/product/ProductContext";

export const useFeatureNavigation = () => {
	const { product, editingState, setEditingState, setSheet } =
		useProductContext();
	const [selectedIndex, setSelectedIndex] = useState<number>(0);

	// Get filtered items (non-price items)
	const filteredItems = productV2ToFeatureItems({ items: product?.items });
	// const filteredItems = useMemo(() => {
	// 	return productV2ToFeatureItems({ items: product?.items });
	// }, [product?.items]);

	// Update selected index when editing state changes or items change
	useEffect(() => {
		if (editingState.id && filteredItems.length > 0) {
			const currentIndex = filteredItems.findIndex(
				(item: ProductItem) => {
					// Find the actual index in the product items array
					const actualIndex = product?.items?.findIndex((i: ProductItem) => i === item) ?? 0;
					const itemId = getItemId({ item, itemIndex: actualIndex });
					return itemId === editingState.id;
				},
			);
			if (currentIndex !== -1) {
				setSelectedIndex(currentIndex);
			}
		} else if (filteredItems.length === 0) {
			// Reset selection when no items
			setSelectedIndex(0);
		}
	}, [editingState.id, filteredItems, product?.items]);

	// Handle when selected index becomes out of bounds (e.g., item deleted)
	useEffect(() => {
		if (selectedIndex >= filteredItems.length && filteredItems.length > 0) {
			setSelectedIndex(filteredItems.length - 1);
		}
	}, [selectedIndex, filteredItems.length]);

	// Navigation functions
	const navigateToIndex = useCallback(
		(index: number) => {
			if (filteredItems.length === 0) return;

			const clampedIndex = Math.max(
				0,
				Math.min(index, filteredItems.length - 1),
			);
			setSelectedIndex(clampedIndex);

			const item = filteredItems[clampedIndex];
			if (item) {
				// Find the actual index in the product items array
				const actualIndex = product?.items?.findIndex((i: ProductItem) => i === item) ?? clampedIndex;
				const itemId = getItemId({ item, itemIndex: actualIndex });
				setEditingState({ type: "feature", id: itemId });
				setSheet("edit-feature");
			}
		},
		[filteredItems, setEditingState, setSheet, product?.items],
	);

	const navigateUp = useCallback(() => {
		navigateToIndex(selectedIndex - 1);
	}, [selectedIndex, navigateToIndex]);

	const navigateDown = useCallback(() => {
		navigateToIndex(selectedIndex + 1);
	}, [selectedIndex, navigateToIndex]);

	const selectFirst = useCallback(() => {
		navigateToIndex(0);
	}, [navigateToIndex]);

	const selectLast = useCallback(() => {
		navigateToIndex(filteredItems.length - 1);
	}, [filteredItems.length, navigateToIndex]);

	const editPlan = useCallback(() => {
		if (!product) return;
		setEditingState({ type: "plan", id: product.id });
		setSheet("edit-plan");
	}, [product, setEditingState, setSheet]);

	const addNewFeature = useCallback(() => {
		// Trigger the add feature popover by clicking the button
		const addFeatureButton = document.querySelector('[aria-label="Add new feature"]');
		if (addFeatureButton) {
			(addFeatureButton as HTMLElement).click();
		}
	}, []);

	const editCurrentItem = useCallback(() => {
		// Use the existing editPlan function to open plan editing
		editPlan();
	}, [editPlan]);

	// Register hotkeys
	useHotkeys("up", navigateUp, {
		preventDefault: true,
		enabled: filteredItems.length > 0,
	});

	useHotkeys("down", navigateDown, {
		preventDefault: true,
		enabled: filteredItems.length > 0,
	});

	useHotkeys("home", selectFirst, {
		preventDefault: true,
		enabled: filteredItems.length > 0,
	});

	useHotkeys("end", selectLast, {
		preventDefault: true,
		enabled: filteredItems.length > 0,
	});

	// 0 key to edit plan
	useHotkeys("0", editPlan, {
		preventDefault: true,
		enabled: !!product,
	});

	// n key to add new feature
	useHotkeys("n", addNewFeature, {
		preventDefault: true,
		enabled: true,
	});

	// e key to edit plan
	useHotkeys("e", editCurrentItem, {
		preventDefault: true,
		enabled: !!product,
	});

	// Number key navigation (1-9) - using individual hooks to avoid loop issues
	useHotkeys("1", () => navigateToIndex(0), {
		preventDefault: true,
		enabled: filteredItems.length >= 1,
	});
	useHotkeys("2", () => navigateToIndex(1), {
		preventDefault: true,
		enabled: filteredItems.length >= 2,
	});
	useHotkeys("3", () => navigateToIndex(2), {
		preventDefault: true,
		enabled: filteredItems.length >= 3,
	});
	useHotkeys("4", () => navigateToIndex(3), {
		preventDefault: true,
		enabled: filteredItems.length >= 4,
	});
	useHotkeys("5", () => navigateToIndex(4), {
		preventDefault: true,
		enabled: filteredItems.length >= 5,
	});
	useHotkeys("6", () => navigateToIndex(5), {
		preventDefault: true,
		enabled: filteredItems.length >= 6,
	});
	useHotkeys("7", () => navigateToIndex(6), {
		preventDefault: true,
		enabled: filteredItems.length >= 7,
	});
	useHotkeys("8", () => navigateToIndex(7), {
		preventDefault: true,
		enabled: filteredItems.length >= 8,
	});
	useHotkeys("9", () => navigateToIndex(8), {
		preventDefault: true,
		enabled: filteredItems.length >= 9,
	});

	return {
		selectedIndex,
		filteredItems,
		navigateToIndex,
		navigateUp,
		navigateDown,
		selectFirst,
		selectLast,
		editPlan,
		addNewFeature,
		editCurrentItem,
		hasItems: filteredItems.length > 0,
	};
};
