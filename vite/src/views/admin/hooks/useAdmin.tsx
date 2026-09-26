import { useEffect, useState } from "react";
import { useLocalStorage } from "@/hooks/common/useLocalStorage";
import { useSession } from "@/lib/auth-client";
import { notNullish } from "@/utils/genUtils";

export const useAdmin = () => {
	const { data, isPending } = useSession();
	const [isAdmin, setIsAdmin] = useState(false);
	const [adminHoverEnabled, setAdminHoverEnabled] = useLocalStorage(
		"autumn.adminHoverEnabled",
		true,
	);

	useEffect(() => {
		if (
			data?.user?.role === "admin" ||
			notNullish(data?.session?.impersonatedBy)
		) {
			setIsAdmin(true);
		} else {
			setIsAdmin(false);
		}
	}, [data]);

	return {
		isAdmin,
		isPending,
		isCurrentlyImpersonating: notNullish(data?.session?.impersonatedBy),
		adminHoverEnabled,
		setAdminHoverEnabled,
		skipHover:
			!adminHoverEnabled ||
			data?.user?.id === "user_2tMgAiPsQzX8JTHjZZh9m0VdvUv",
	};
};
