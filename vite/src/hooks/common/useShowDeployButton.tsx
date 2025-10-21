import type { CustomerWithProducts } from "@autumn/shared";
import { useCallback, useEffect, useState } from "react";
import { useProductsQuery } from "@/hooks/queries/useProductsQuery";
import { useGeneralQuery } from "../queries/useGeneralQuery";

const DEPLOY_BUTTON_STORAGE_KEY = "autumn_show_deploy_button";

export const useShowDeployButton = () => {
	const { products } = useProductsQuery();
	const { data: customersData, isLoading: isLoadingCustomers } =
		useGeneralQuery({
			url: "/customers/all/search",
			method: "POST",
			queryKey: ["customers", "all", "search"],
		});

	const getStoredValue = useCallback((): boolean | null => {
		try {
			const stored = localStorage.getItem(DEPLOY_BUTTON_STORAGE_KEY);
			return stored ? JSON.parse(stored) : null;
		} catch {
			return null;
		}
	}, []);

	const [showDeployButton, setShowDeployButton] = useState<boolean>(() => {
		const stored = getStoredValue();
		return stored !== null ? stored : false;
	});

	// Only show checking state if we don't have a stored value AND data is still loading
	const isChecking = getStoredValue() === null && isLoadingCustomers;

	useEffect(() => {
		// Wait for data to be available before checking
		if (!customersData) return;

		const checkConditions = () => {
			try {
				// Check if at least 1 product exists
				const hasProduct = products.length > 0;

				if (!hasProduct) {
					const newValue = false;
					// Only update if different
					setShowDeployButton((prev) => {
						if (prev !== newValue) {
							localStorage.setItem(
								DEPLOY_BUTTON_STORAGE_KEY,
								JSON.stringify(newValue),
							);
							return newValue;
						}
						return prev;
					});
					return;
				}

				// Check if at least 1 non-demo customer exists
				const hasNonDemoCustomer = customersData.customers.some(
					(customer: CustomerWithProducts) =>
						customer.id !== "onboarding_demo_user",
				);

				const shouldShow = hasProduct && hasNonDemoCustomer;

				// Only update if the value changed
				setShowDeployButton((prev) => {
					if (prev !== shouldShow) {
						localStorage.setItem(
							DEPLOY_BUTTON_STORAGE_KEY,
							JSON.stringify(shouldShow),
						);
						return shouldShow;
					}
					return prev;
				});
			} catch (error) {
				console.error("Error checking deploy button conditions:", error);
				setShowDeployButton(false);
			}
		};

		checkConditions();
	}, [products.length, customersData]);

	return { showDeployButton, isChecking };
};
