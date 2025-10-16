import { AppEnv } from "autumn-js";
import { useHotkeys } from "react-hotkeys-hook";
import { useNavigate } from "react-router";
import { useListOrganizations } from "@/lib/auth-client";
import { useEnv } from "@/utils/envUtils";
import { navigateTo } from "@/utils/genUtils";
import { useAdmin } from "@/views/admin/hooks/useAdmin";
import { handleEnvChange } from "@/views/main-sidebar/EnvDropdown";

interface UseCommandBarHotkeysProps {
	/** Callback to close the command bar */
	closeDialog: () => void;
	/** Callback to switch to orgs page */
	switchToOrgsPage: () => void;
	/** Callback to switch to impersonate page */
	switchToImpersonatePage: () => void;
}

/**
 * Hook to manage command bar hotkeys
 */
export const useCommandBarHotkeys = ({
	closeDialog,
	switchToOrgsPage,
	switchToImpersonatePage,
}: UseCommandBarHotkeysProps) => {
	const navigate = useNavigate();
	const env = useEnv();
	const { data: orgs, isPending: isLoadingOrgs } = useListOrganizations();
	const { isAdmin } = useAdmin();

	// CMD+K: Open command bar
	useHotkeys("meta+k", () => {
		// This is handled in the component itself
	});

	// CMD+1: Go to Products
	useHotkeys(
		"meta+1",
		() => {
			navigateTo("/products?tab=products", navigate, env);
			closeDialog();
		},
		{ enableOnFormTags: true, preventDefault: true },
	);

	// CMD+2: Go to Features
	useHotkeys(
		"meta+2",
		() => {
			navigateTo("/products?tab=features", navigate, env);
			closeDialog();
		},
		{ enableOnFormTags: true, preventDefault: true },
	);

	// CMD+3: Go to Customers
	useHotkeys(
		"meta+3",
		() => {
			navigateTo("/customers", navigate, env);
			closeDialog();
		},
		{ enableOnFormTags: true, preventDefault: true },
	);

	// CMD+4: Switch Environment
	useHotkeys(
		"meta+4",
		() => {
			handleEnvChange(
				env === AppEnv.Sandbox ? AppEnv.Live : AppEnv.Sandbox,
				true,
			);
			closeDialog();
		},
		{ enableOnFormTags: true, preventDefault: true },
	);

	// CMD+5: Switch Organization (only if user has multiple orgs)
	useHotkeys(
		"meta+5",
		() => {
			if (!isLoadingOrgs && orgs && orgs.length > 1) {
				switchToOrgsPage();
			}
		},
		{ enableOnFormTags: true, preventDefault: true },
	);

	// CMD+6: Impersonate (only if user is admin)
	useHotkeys(
		"meta+6",
		() => {
			if (isAdmin) {
				switchToImpersonatePage();
			}
		},
		{ enableOnFormTags: true, preventDefault: true },
	);
};
