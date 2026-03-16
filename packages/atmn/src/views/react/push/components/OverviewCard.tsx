import { Text } from "ink";
import type { PushAnalysis } from "../../../../commands/push/types.js";
import { Card, LoadingText } from "../../components/index.js";

interface OverviewCardProps {
	analysis: PushAnalysis | null;
	isLoading: boolean;
}

/**
 * Overview summary card
 */
export function OverviewCard({ analysis, isLoading }: OverviewCardProps) {
	if (isLoading) {
		return (
			<Card title="📊 Overview">
				<LoadingText text="Analyzing changes..." />
			</Card>
		);
	}

	if (!analysis) {
		return null;
	}

	const featuresToPush =
		analysis.featuresToCreate.length + analysis.featuresToUpdate.length;
	const featuresToDelete = analysis.featuresToDelete.length;
	const plansToPush =
		analysis.plansToCreate.length + analysis.plansToUpdate.length;
	const plansToDelete = analysis.plansToDelete.length;

	const warnings: string[] = [];

	if (analysis.archivedFeatures.length > 0) {
		warnings.push(
			`${analysis.archivedFeatures.length} archived feature(s) in config`,
		);
	}

	if (analysis.archivedPlans.length > 0) {
		warnings.push(
			`${analysis.archivedPlans.length} archived plan(s) in config`,
		);
	}

	const plansWithVersioning = analysis.plansToUpdate.filter(
		(p) => p.willVersion,
	);
	if (plansWithVersioning.length > 0) {
		warnings.push(
			`${plansWithVersioning.length} plan(s) will create new versions`,
		);
	}

	return (
		<Card title="📊 Overview">
			<Text>
				<Text color="gray">Features:</Text>{" "}
				<Text color="green">{featuresToPush} to push</Text>
				{featuresToDelete > 0 && (
					<Text color="red">, {featuresToDelete} to delete</Text>
				)}
			</Text>
			<Text>
				<Text color="gray">Plans:</Text>{" "}
				<Text color="green">{plansToPush} to push</Text>
				{plansToDelete > 0 && (
					<Text color="red">, {plansToDelete} to delete</Text>
				)}
			</Text>
			{warnings.map((warning) => (
				<Text key={warning} color="yellow">
					⚠ {warning}
				</Text>
			))}
		</Card>
	);
}
