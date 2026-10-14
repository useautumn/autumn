import { type ProductItem, productV2ToFeatureItems } from "@autumn/shared";
import { useCallback, useEffect, useState } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import {
	useProduct,
	useSheet,
} from "@/components/v2/inline-custom-plan-editor/PlanEditorContext";
import { getItemId } from "@/utils/product/productItemUtils";

export const useFeatureNavigation = () => {
	const { product } = useProduct();
	const { itemId, setSheet } = useSheet();
	const [selectedIndex, setSelectedIndex] = useState<number>(0);

	const filteredItems = productV2ToFeatureItems({ items: product.items });
	useEffect(() => {
		if (itemId && filteredItems.length > 0) {
			const currentIndex = filteredItems.findIndex((item: ProductItem) => {
				const actualIndex =
					product?.items?.findIndex((i: ProductItem) => i === item) ?? 0;
				const currentItemId = getItemId({ item, itemIndex: actualIndex });
				return currentItemId === itemId;
			});
			if (currentIndex !== -1) {
				setSelectedIndex(currentIndex);
			}
		} else if (filteredItems.length === 0) {
			setSelectedIndex(0);
		}
	}, [itemId, filteredItems, product?.items]);

	useEffect(() => {
		if (selectedIndex >= filteredItems.length && filteredItems.length > 0) {
			setSelectedIndex(filteredItems.length - 1);
		}
	}, [selectedIndex, filteredItems.length]);

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
				const actualIndex =
					product?.items?.findIndex((i: ProductItem) => i === item) ??
					clampedIndex;
				const itemId = getItemId({ item, itemIndex: actualIndex });
				setSheet({ type: "edit-feature", itemId });
			}
		},
		[filteredItems, setSheet, product?.items],
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
		setSheet({ type: "edit-plan", itemId: product.id });
	}, [product, setSheet]);

	const addNewFeature = useCallback(() => {
		const addFeatureButton = document.querySelector(
			'[aria-label="Add new feature"]',
		);
		if (addFeatureButton) {
			(addFeatureButton as HTMLElement).click();
		}
	}, []);

	const editCurrentItem = useCallback(() => {
		editPlan();
	}, [editPlan]);

	const isSelectOpen = useCallback(() => {
		const openElements = document.querySelectorAll('[data-state="open"]');
		return openElements.length > 0;
	}, []);

	useHotkeys(
		"up",
		(e) => {
			if (!isSelectOpen()) {
				navigateUp();
			}
		},
		{
			preventDefault: true,
			enabled: filteredItems.length > 0,
		},
	);

	useHotkeys(
		"down",
		(e) => {
			if (!isSelectOpen()) {
				navigateDown();
			}
		},
		{
			preventDefault: true,
			enabled: filteredItems.length > 0,
		},
	);

	useHotkeys("home", selectFirst, {
		preventDefault: true,
		enabled: filteredItems.length > 0,
	});

	useHotkeys("end", selectLast, {
		preventDefault: true,
		enabled: filteredItems.length > 0,
	});

	useHotkeys("0", editPlan, {
		preventDefault: true,
		enabled: !!product,
	});

	useHotkeys("n", addNewFeature, {
		preventDefault: true,
		enabled: true,
	});

	useHotkeys("e", editCurrentItem, {
		preventDefault: true,
		enabled: !!product,
	});

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
