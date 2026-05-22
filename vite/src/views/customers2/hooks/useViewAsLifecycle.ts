import { useEffect } from "react";
import { useViewAsStore } from "@/hooks/stores/useViewAsStore";

/**
 * Clears the view-as pin when the customer changes (React Router keeps the
 * same instance across `:customer_id` param changes) and on unmount.
 */
export function useViewAsLifecycle(customerId: string | undefined) {
	const clearViewAs = useViewAsStore((s) => s.clearViewAs);
	useEffect(() => {
		clearViewAs();
		return () => clearViewAs();
	}, [customerId, clearViewAs]);
}
