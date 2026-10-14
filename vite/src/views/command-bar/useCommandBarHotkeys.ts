import { AppEnv } from "@autumn/shared";
import { useHotkeys } from "react-hotkeys-hook";
import { useNavigate } from "react-router";
import { useListOrganizations } from "@/lib/auth-client";
import { useEnv } from "@/utils/envUtils";
import { navigateTo } from "@/utils/genUtils";
import { useAdmin } from "@/views/admin/hooks/useAdmin";
import { useEnvChange } from "@/views/main-sidebar/EnvDropdown";

interface UseCommandBarHotkeysProps {
	isOpen: boolean;
	closeDialog: () => void;
	cycleTheme: () => void;
	switchToOrgsPage: () => void;
	switchToImpersonatePage: () => void;
}

export const useCommandBarHotkeys = ({
	isOpen,
	closeDialog,
	cycleTheme,
	switchToOrgsPage,
	switchToImpersonatePage,
}: UseCommandBarHotkeysProps) => {
	const navigate = useNavigate();
	const env = useEnv();
	const handleEnvChange = useEnvChange();
	const { data: orgs, isPending: isLoadingOrgs } = useListOrganizations();
	const { isAdmin } = useAdmin();

	useHotkeys(
		"meta+1",
		() => {
			navigateTo("/products?tab=products", navigate, env);
			closeDialog();
		},
		{ enableOnFormTags: true, preventDefault: true, enabled: isOpen },
	);

	useHotkeys(
		"meta+2",
		() => {
			navigateTo("/products?tab=features", navigate, env);
			closeDialog();
		},
		{ enableOnFormTags: true, preventDefault: true, enabled: isOpen },
	);

	useHotkeys(
		"meta+3",
		() => {
			navigateTo("/customers", navigate, env);
			closeDialog();
		},
		{ enableOnFormTags: true, preventDefault: true, enabled: isOpen },
	);

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

	useHotkeys(
		"meta+5",
		() => {
			cycleTheme();
		},
		{ enableOnFormTags: true, preventDefault: true, enabled: isOpen },
	);

	useHotkeys(
		"meta+6",
		() => {
			if (!isLoadingOrgs && orgs && orgs.length > 1) {
				switchToOrgsPage();
			}
		},
		{ enableOnFormTags: true, preventDefault: true, enabled: isOpen },
	);

	useHotkeys(
		"meta+7",
		() => {
			if (isAdmin) {
				switchToImpersonatePage();
			}
		},
		{ enableOnFormTags: true, preventDefault: true, enabled: isOpen },
	);

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
