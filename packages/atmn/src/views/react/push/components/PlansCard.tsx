import { Text } from "ink";
import type { PlanDeleteInfo } from "../../../../commands/push/types.js";
import type { Plan } from "../../../../compose/models/index.js";
import type { PlanStatus } from "../../../../lib/hooks/usePush.js";
import { Card, StatusRow } from "../../components/index.js";

interface PlansCardProps {
	plans: Plan[];
	progress: Map<string, PlanStatus>;
	/** Plans pending deletion (shown during deleting phase) */
	deletions?: PlanDeleteInfo[];
}

function getStatusFromPlanStatus(
	status: PlanStatus,
): "pending" | "loading" | "success" | "warning" | "error" | "skipped" {
	switch (status) {
		case "pending":
			return "pending";
		case "pushing":
			return "loading";
		case "created":
		case "updated":
		case "versioned":
		case "deleted":
		case "archived":
			return "success";
		case "skipped":
			return "skipped";
		default:
			return "pending";
	}
}

function getActionFromPlanStatus(
	status: PlanStatus,
):
	| "created"
	| "updated"
	| "deleted"
	| "archived"
	| "skipped"
	| "unchanged"
	| "versioned"
	| undefined {
	switch (status) {
		case "created":
			return "created";
		case "updated":
			return "updated";
		case "versioned":
			return "versioned";
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
 * Plans progress card (includes deletions/archives)
 */
export function PlansCard({ plans, progress, deletions = [] }: PlansCardProps) {
	const displayLimit = 4;
	const totalCount = plans.length + deletions.length;

	// Combine plans and deletions for display
	const allItems: Array<{ id: string; name: string; isDeletion: boolean }> = [
		...plans.map((p) => ({ id: p.id, name: p.name, isDeletion: false })),
		...deletions.map((d) => ({ id: d.id, name: d.id, isDeletion: true })),
	];

	if (totalCount === 0) {
		return (
			<Card title="📋 Changed Plans (0)">
				<Text color="gray">No plans to push</Text>
			</Card>
		);
	}

	return (
		<Card title={`📋 Changed Plans (${totalCount})`}>
			{allItems.slice(0, displayLimit).map((item) => {
				const status = progress.get(item.id) || "pending";
				return (
					<StatusRow
						key={item.id}
						status={getStatusFromPlanStatus(status)}
						label={item.name}
						detail={item.id}
						action={getActionFromPlanStatus(status)}
					/>
				);
			})}
			{totalCount > displayLimit && (
				<Text color="gray">...and {totalCount - displayLimit} more</Text>
			)}
		</Card>
	);
}
