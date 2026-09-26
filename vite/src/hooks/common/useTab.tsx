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
	// Logs is a tab inside the Usage page.
	if (path.startsWith("/analytics") || path.startsWith("/logs")) {
		return "analytics";
	}
	if (path.startsWith("/onboarding")) {
		return "onboarding";
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
