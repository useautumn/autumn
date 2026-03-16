import { Text } from "ink";
import type { FeatureDeleteInfo } from "../../../../commands/push/types.js";
import type { Feature } from "../../../../compose/models/index.js";
import type { FeatureStatus } from "../../../../lib/hooks/usePush.js";
import { Card, StatusRow } from "../../components/index.js";

interface FeaturesCardProps {
	features: Feature[];
	updates: Feature[];
	progress: Map<string, FeatureStatus>;
	/** Features pending deletion */
	deletions?: FeatureDeleteInfo[];
}

function getStatusFromFeatureStatus(
	status: FeatureStatus,
): "pending" | "loading" | "success" | "warning" | "error" | "skipped" {
	switch (status) {
		case "pending":
			return "pending";
		case "pushing":
			return "loading";
		case "created":
		case "updated":
		case "deleted":
		case "archived":
			return "success";
		case "skipped":
			return "skipped";
		default:
			return "pending";
	}
}

function getActionFromFeatureStatus(
	status: FeatureStatus,
):
	| "created"
	| "updated"
	| "deleted"
	| "archived"
	| "skipped"
	| "unchanged"
	| undefined {
	switch (status) {
		case "created":
			return "created";
		case "updated":
			return "updated";
		case "deleted":
			return "deleted";
		case "archived":
			return "archived";
		case "skipped":
			return "skipped";
		default:
			return undefined;
	}
}

/**
 * Features progress card (includes deletions/archives)
 */
export function FeaturesCard({
	features,
	updates,
	progress,
	deletions = [],
}: FeaturesCardProps) {
	// Combine all features and deletions
	const allItems: Array<{ id: string; name: string }> = [
		...features.map((f) => ({ id: f.id, name: f.name })),
		...updates.map((f) => ({ id: f.id, name: f.name })),
		...deletions.map((d) => ({ id: d.id, name: d.id })),
	];
	const displayLimit = 4;

	if (allItems.length === 0) {
		return (
			<Card title="🎯 Changed Features (0)">
				<Text color="gray">No features to push</Text>
			</Card>
		);
	}

	return (
		<Card title={`🎯 Changed Features (${allItems.length})`}>
			{allItems.slice(0, displayLimit).map((item) => {
				const status = progress.get(item.id) || "pending";
				return (
					<StatusRow
						key={item.id}
						status={getStatusFromFeatureStatus(status)}
						label={item.name}
						detail={item.id}
						action={getActionFromFeatureStatus(status)}
					/>
				);
			})}
			{allItems.length > displayLimit && (
				<Text color="gray">...and {allItems.length - displayLimit} more</Text>
			)}
		</Card>
	);
}
