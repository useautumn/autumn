import { Button } from "@autumn/ui";
import { useAtomQuery } from "@/hooks/queries/useAtomQuery";
import { getBackendErr } from "@/utils/genUtils";
import { SettingsSection } from "../SettingsSection";
import { AtomRemovalSheet } from "./components/atom/AtomRemovalSheet";
import { AtomSetupFlow } from "./components/atom/AtomSetupFlow";
import { AtomSteadyStateSkeleton } from "./components/atom/AtomSteadyState";

const AtomContent = () => {
	const { cache, stackName, stackNameSuffix, isLoading, error, refetch } =
		useAtomQuery();

	if (isLoading) return <AtomSteadyStateSkeleton />;

	if (error)
		return (
			<div
				role="alert"
				className="flex flex-col items-start gap-3 rounded-lg border bg-card p-4"
			>
				<p className="text-sm text-tertiary-foreground">
					{getBackendErr(error, "We couldn't load your Atom.")}
				</p>
				<Button variant="secondary" onClick={() => refetch()}>
					Try again
				</Button>
			</div>
		);

	return (
		<AtomSetupFlow
			cache={cache}
			stackName={stackName}
			stackNameSuffix={stackNameSuffix}
		/>
	);
};

export const AtomSection = () => {
	const { removing } = useAtomQuery();
	return (
		<SettingsSection
			title="Atom"
			badge="PREVIEW"
			description="Answer balance checks from your own cloud."
			actions={<AtomRemovalSheet removing={removing} />}
		>
			<AtomContent />
		</SettingsSection>
	);
};
