import { PageContainer, PageHeader } from "@autumn/ui";
import { Atom } from "@phosphor-icons/react";
import { DefaultView } from "../../DefaultView";
import LoadingScreen from "../../general/LoadingScreen";
import { useAdmin } from "../hooks/useAdmin";
import { ShadowAtomTab } from "./ShadowAtomTab";

/** Staff-only page behind the admin bar's Shadow Atom button. */
export const ShadowAtomView = () => {
	const { isAdmin, isPending } = useAdmin();

	if (isPending)
		return (
			<div className="h-dvh w-screen">
				<LoadingScreen />
			</div>
		);
	if (!isAdmin) return <DefaultView />;

	return (
		<PageContainer className="gap-6">
			<PageHeader
				icon={<Atom className="size-4 text-subtle" />}
				title="Shadow Atom"
			/>
			<ShadowAtomTab />
		</PageContainer>
	);
};
