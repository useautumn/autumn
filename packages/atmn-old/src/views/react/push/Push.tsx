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
	allVersions?: boolean;
	yes?: boolean;
	onComplete?: () => void;
}

export function PushView({
	environment = AppEnv.Sandbox,
	allVersions = false,
	yes = false,
	onComplete,
}: PushViewProps) {
	const push = usePush({ environment, allVersions, yes, onComplete });
	const duration = ((Date.now() - push.startTime) / 1000).toFixed(1);

	if (push.error) {
		return <ErrorCard error={push.error} />;
	}

	const allPlans = [
		...(push.analysis?.plansToCreate ?? []),
		...(push.analysis?.plansToUpdate?.map((p) => p.plan) ?? []),
		...(push.analysis?.variantsToUpdate?.map((p) => p.variant) ?? []),
	];

	return (
		<CardWidthProvider>
			<Box flexDirection="column" marginBottom={1}>
				<Card title="🍂 Pushing to Autumn" />

				{push.phase === "loading_config" && (
					<Card title="📂 Config">
						<LoadingText text="Loading autumn.config.ts..." />
					</Card>
				)}

				{push.phase !== "loading_config" && (
					<OrgCard
						orgInfo={push.orgInfo}
						isLoading={push.phase === "loading_org" || !push.orgInfo}
					/>
				)}

				{push.phase !== "loading_config" &&
					push.phase !== "loading_org" &&
					push.phase !== "no_changes" && (
						<OverviewCard
							analysis={push.analysis}
							isLoading={push.phase === "analyzing"}
						/>
					)}

				{push.phase === "no_changes" && <NoChangesCard />}

				{push.currentPrompt && (
					<PushPromptCard
						onBack={push.goBackPrompt}
						prompt={push.currentPrompt}
						onRespond={push.respondToPrompt}
					/>
				)}

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

				{(push.phase === "pushing_plans" ||
					push.phase === "deleting" ||
					push.phase === "complete") && (
					<PlansCard
						plans={allPlans}
						progress={push.planProgress}
						deletions={push.analysis?.plansToDelete ?? []}
					/>
				)}

				{push.phase === "complete" && (
					<CompletionMessage duration={duration} environment={environment} />
				)}

				{push.phase === "no_changes" && (
					<Box marginTop={1}>
						<Text color="green">✨ Already in sync</Text>
					</Box>
				)}
			</Box>
		</CardWidthProvider>
	);
}
