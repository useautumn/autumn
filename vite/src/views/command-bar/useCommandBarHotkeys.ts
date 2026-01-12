import { AppEnv } from "autumn-js";
import { useHotkeys } from "react-hotkeys-hook";
import { useNavigate } from "react-router";
import { useListOrganizations } from "@/lib/auth-client";
import { useEnv } from "@/utils/envUtils";
import { navigateTo } from "@/utils/genUtils";
import { useAdmin } from "@/views/admin/hooks/useAdmin";
import { handleEnvChange } from "@/views/main-sidebar/EnvDropdown";

interface UseCommandBarHotkeysProps {
	/** Whether the command bar is open */
	isOpen: boolean;
	/** Callback to close the command bar */
	closeDialog: () => void;
	/** Callback to cycle theme */
	cycleTheme: () => void;
	/** Callback to switch to orgs page */
	switchToOrgsPage: () => void;
	/** Callback to switch to impersonate page */
	switchToImpersonatePage: () => void;
}

/**
 * Hook to manage command bar hotkeys (only active when command bar is open)
 */
export const useCommandBarHotkeys = ({
	isOpen,
	closeDialog,
	cycleTheme,
	switchToOrgsPage,
	switchToImpersonatePage,
}: UseCommandBarHotkeysProps) => {
	const navigate = useNavigate();
	const env = useEnv();
	const { data: orgs, isPending: isLoadingOrgs } = useListOrganizations();
	const { isAdmin } = useAdmin();

	// CMD+1: Go to Plans (only when command bar is open)
	useHotkeys(
		"meta+1",
		() => {
			navigateTo("/products?tab=products", navigate, env);
			closeDialog();
		},
		{ enableOnFormTags: true, preventDefault: true, enabled: isOpen },
	);

	// CMD+2: Go to Features (only when command bar is open)
	useHotkeys(
		"meta+2",
		() => {
			navigateTo("/products?tab=features", navigate, env);
			closeDialog();
		},
		{ enableOnFormTags: true, preventDefault: true, enabled: isOpen },
	);

	// CMD+3: Go to Customers (only when command bar is open)
	useHotkeys(
		"meta+3",
		() => {
			navigateTo("/customers", navigate, env);
			closeDialog();
		},
		{ enableOnFormTags: true, preventDefault: true, enabled: isOpen },
	);

	// CMD+4: Switch Environment (only when command bar is open)
	useHotkeys(
		"meta+4",
		() => {
			handleEnvChange(
				env === AppEnv.Sandbox ? AppEnv.Live : AppEnv.Sandbox,
				true,
			);
			closeDialog();
		},
		{ enableOnFormTags: true, preventDefault: true, enabled: isOpen },
	);

	// CMD+5: Cycle Theme (only when command bar is open)
	useHotkeys(
		"meta+5",
		() => {
			cycleTheme();
		},
		{ enableOnFormTags: true, preventDefault: true, enabled: isOpen },
	);

	// CMD+6: Switch Organization (only when command bar is open and user has multiple orgs)
	useHotkeys(
		"meta+6",
		() => {
			if (!isLoadingOrgs && orgs && orgs.length > 1) {
				switchToOrgsPage();
			}
		},
		{ enableOnFormTags: true, preventDefault: true, enabled: isOpen },
	);

	// CMD+7: Impersonate (only when command bar is open and user is admin)
	useHotkeys(
		"meta+7",
		() => {
			if (isAdmin) {
				switchToImpersonatePage();
			}
		},
		{ enableOnFormTags: true, preventDefault: true, enabled: isOpen },
	);

	// CMD+I: Impersonate (alternative shortcut)
	useHotkeys(
		"meta+i",
		() => {
			if (isAdmin) {
				switchToImpersonatePage();
			}
		},
		{ enableOnFormTags: true, preventDefault: true, enabled: isOpen },
	);
};
