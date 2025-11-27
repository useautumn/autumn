import { useEffect, useState } from "react";
import { useSession } from "@/lib/auth-client";
import { notNullish } from "@/utils/genUtils";

export const useAdmin = () => {
	const { data, isPending } = useSession();
	const [isAdmin, setIsAdmin] = useState(false);

	useEffect(() => {
		if (
			(data?.user?.role === "admin" ||
				notNullish(data?.session.impersonatedBy)) &&
			data?.user?.id !== "user_2tMgAiPsQzX8JTHjZZh9m0VdvUv"
		) {
			setIsAdmin(true);
		} else {
			setIsAdmin(false);
		}
	}, [data]);

	return { isAdmin, isPending };
};
