import { Box, Text } from "ink";
import { AppEnv } from "../../../lib/env/index.js";
import { usePush } from "../../../lib/hooks/usePush.js";
import { Card, CardWidthProvider, LoadingText } from "../components/index.js";
import {
	CompletionMessage,
	ErrorCard,
	FeaturesCard,
	NoChangesCard,
	OrgCard,
	OverviewCard,
	PlansCard,
	PushPromptCard,
} from "./components/index.js";

interface PushViewProps {
	environment?: AppEnv;
	yes?: boolean;
	onComplete?: () => void;
}

/**
 * Beautiful push command UI with progressive rendering
 * Pure rendering component - all logic is in usePush hook
 */
export function PushView({
	environment = AppEnv.Sandbox,
	yes = false,
	onComplete,
}: PushViewProps) {
	const push = usePush({ environment, yes, onComplete });
	const duration = ((Date.now() - push.startTime) / 1000).toFixed(1);

	// Error state
	if (push.error) {
		return <ErrorCard error={push.error} />;
	}

	// Build all plans list for display
	const allPlans = [
		...(push.analysis?.plansToCreate ?? []),
		...(push.analysis?.plansToUpdate?.map((p) => p.plan) ?? []),
	];

	return (
		<CardWidthProvider>
			<Box flexDirection="column" marginBottom={1}>
				{/* Header */}
				<Card title="🍂 Pushing to Autumn" />

				{/* Loading Config */}
				{push.phase === "loading_config" && (
					<Card title="📂 Config">
						<LoadingText text="Loading autumn.config.ts..." />
					</Card>
				)}

				{/* Organization Card */}
				{push.phase !== "loading_config" && (
					<OrgCard
						orgInfo={push.orgInfo}
						isLoading={push.phase === "loading_org" || !push.orgInfo}
					/>
				)}

				{/* Overview Card - show during/after analysis (but not for no_changes) */}
				{push.phase !== "loading_config" &&
					push.phase !== "loading_org" &&
					push.phase !== "no_changes" && (
						<OverviewCard
							analysis={push.analysis}
							isLoading={push.phase === "analyzing"}
						/>
					)}

				{/* No Changes Card */}
				{push.phase === "no_changes" && <NoChangesCard />}

				{/* Current Prompt - if any */}
				{push.currentPrompt && (
					<PushPromptCard
						prompt={push.currentPrompt}
						onRespond={push.respondToPrompt}
					/>
				)}

				{/* Features Card - show during/after push (includes deletions) */}
				{(push.phase === "pushing_features" ||
					push.phase === "pushing_plans" ||
					push.phase === "deleting" ||
					push.phase === "complete") && (
					<FeaturesCard
						features={push.analysis?.featuresToCreate ?? []}
						updates={push.analysis?.featuresToUpdate ?? []}
						progress={push.featureProgress}
						deletions={push.analysis?.featuresToDelete ?? []}
					/>
				)}

				{/* Plans Card (includes deletions) */}
				{(push.phase === "pushing_plans" ||
					push.phase === "deleting" ||
					push.phase === "complete") && (
					<PlansCard
						plans={allPlans}
						progress={push.planProgress}
						deletions={push.analysis?.plansToDelete ?? []}
					/>
				)}

				{/* Completion Message */}
				{push.phase === "complete" && (
					<CompletionMessage duration={duration} environment={environment} />
				)}

				{/* No Changes Completion */}
				{push.phase === "no_changes" && (
					<Box marginTop={1}>
						<Text color="green">✨ Already in sync</Text>
					</Box>
				)}
			</Box>
		</CardWidthProvider>
	);
}
