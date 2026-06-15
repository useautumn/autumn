import { Box, Text } from "ink";
import { useState } from "react";
import { AppEnv } from "../../../lib/env/index.js";
import { usePull } from "../../../lib/hooks/index.js";
import {
	Card,
	CardWidthProvider,
	FeatureRow,
	FileRow,
	KeyValue,
	LoadingText,
	PlanRow,
} from "./components/index.js";

interface PullViewProps {
	onComplete?: () => void;
	/** Environment to pull from */
	environment?: AppEnv;
	/** Force overwrite config (skip in-place update) */
	forceOverwrite?: boolean;
	/** Working directory for file operations */
	cwd?: string;
	/** Skip generating @useautumn-sdk.d.ts */
	noDeclarationFile?: boolean;
}

/**
 * Beautiful pull command UI with progressive rendering
 * Pure rendering component - all logic is in usePull hook
 */
export function PullView({
	onComplete,
	environment = AppEnv.Sandbox,
	forceOverwrite = false,
	cwd,
	noDeclarationFile = false,
}: PullViewProps) {
	const [startTime] = useState(Date.now());
	const {
		orgInfo,
		features,
		plans,
		files,
		isOrgLoading,
		isPullLoading,
		isSuccess,
		error,
		inPlace,
		updateResult,
	} = usePull({ environment, onComplete, forceOverwrite, cwd, noDeclarationFile });

	const duration = ((Date.now() - startTime) / 1000).toFixed(1);

	if (error) {
		return (
			<Box flexDirection="column" padding={1}>
				<Text color="red" bold>
					✗ Error pulling from Autumn
				</Text>
				<Text color="red">{error}</Text>
			</Box>
		);
	}

	return (
		<CardWidthProvider>
			<Box flexDirection="column" marginBottom={1}>
				{/* Header */}
				<Card title="🍂 Pulling from Autumn" />

				{/* Organization Card */}
				{isOrgLoading ? (
					<Card title="📦 Organization">
						<LoadingText text="Fetching..." />
					</Card>
				) : orgInfo ? (
					<Card title="📦 Organization">
						<KeyValue label="Name" value={orgInfo.name} />
						<KeyValue label="Environment" value={orgInfo.environment} />
					</Card>
				) : null}

				{/* Features Card */}
				{!isOrgLoading && (
					<Card
						title={`🎯 Features${features.length > 0 ? ` (${features.length})` : ""}`}
					>
						{isPullLoading && features.length === 0 ? (
							<LoadingText text="Fetching..." />
						) : features.length > 0 ? (
							<>
								{features.slice(0, 4).map((feature) => (
									<FeatureRow key={feature.id} feature={feature} />
								))}
								{features.length > 4 && (
									<Text color="gray">... {features.length - 4} more</Text>
								)}
							</>
						) : null}
					</Card>
				)}

				{/* Plans Card */}
				{!isOrgLoading && (
					<Card
						title={`📋 Plans${plans.length > 0 ? ` (${plans.length})` : ""}`}
					>
						{isPullLoading && plans.length === 0 ? (
							<LoadingText text="Fetching..." />
						) : plans.length > 0 ? (
							<>
								{plans.slice(0, 4).map((plan) => (
									<PlanRow key={plan.id} plan={plan} />
								))}
								{plans.length > 4 && (
									<Text color="gray">... {plans.length - 4} more</Text>
								)}
							</>
						) : null}
					</Card>
				)}

				{/* Generated Files Card */}
				{!isOrgLoading && (
					<Card title="📝 Generated">
						{files.length > 0 ? (
							files.map((file) => (
								<FileRow
									key={file.path}
									name={file.name}
									lines={file.lines}
									done={isSuccess}
								/>
							))
						) : isPullLoading ? (
							<LoadingText text="Generating..." />
						) : null}
					</Card>
				)}

				{/* Completion Message */}
				{isSuccess && (
					<Box marginTop={1} flexDirection="column">
						<Text color="green">✨ Done in {duration}s</Text>
						{inPlace && updateResult && (
							<Box marginTop={0} flexDirection="column">
								<Text color="cyan">
									In-place: {updateResult.featuresUpdated} features updated,{" "}
									{updateResult.featuresAdded} added,{" "}
									{updateResult.featuresDeleted} deleted
								</Text>
								<Text color="cyan">
									{updateResult.plansUpdated} plans updated,{" "}
									{updateResult.plansAdded} added, {updateResult.plansDeleted}{" "}
									deleted
								</Text>
							</Box>
						)}
					</Box>
				)}
			</Box>
		</CardWidthProvider>
	);
}
