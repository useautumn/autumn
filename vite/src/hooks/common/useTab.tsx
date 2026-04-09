import { useLocation } from "react-router";

export const useTab = () => {
	const { pathname } = useLocation();
	const parts = pathname.split("/").filter(Boolean);

	// New URL format: /<org_id>/<env>/<tab>/...
	// parts[0] = org_id, parts[1] = env (live|sandbox), parts[2] = tab
	if (parts.length >= 3 && (parts[1] === "live" || parts[1] === "sandbox")) {
		const tab = parts[2];
		if (
			["admin", "analytics", "features", "products", "customers", "dev"].includes(
				tab,
			)
		) {
			return tab;
		}
	}

	// Fallback for non-org-scoped pages
	if (pathname.startsWith("/admin")) return "admin";

	return "";
};
