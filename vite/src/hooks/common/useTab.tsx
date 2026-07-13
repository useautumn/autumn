import { useLocation } from "react-router";
import { stripSandboxPrefix } from "@/hooks/sandbox/sandboxUrl";

export const useTab = () => {
	const { pathname } = useLocation();
	const path = stripSandboxPrefix(pathname);

	if (path.startsWith("/settings")) {
		return "settings";
	}
	if (path.startsWith("/admin")) {
		return "admin";
	}
	if (path.startsWith("/analytics")) {
		return "analytics";
	}

	if (
		pathname.startsWith("/features") ||
		pathname.startsWith("/sandbox/features")
	) {
		return "features";
	}
	if (path.startsWith("/products")) {
		return "products";
	}
	if (path.startsWith("/migrations")) {
		return "migrations";
	}
	if (path.startsWith("/customers")) {
		return "customers";
	}
	if (path.startsWith("/dev")) {
		return "dev";
	}
	return "";
};
