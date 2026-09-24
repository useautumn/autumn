import { cn } from "@/lib/utils";
import styles from "./catalogWorkflow.module.css";
import { CatalogWorkflowStep } from "./catalogWorkflowStep";

const STEPS = [
	{ title: "Create plans", rows: ["Free: $0/mo", "Pro: $20/mo"] },
	{ title: "Define features", rows: ["Messages", "Projects"] },
	{
		title: "Set allowances",
		rows: ["Free: 100 messages", "Pro: 500 messages"],
	},
	{ title: "Set behavior", rows: ["7-day free trial", "Monthly / annual"] },
];

export function DashboardCatalogDiagram() {
	return (
		<figure
			className={cn("not-prose", styles.diagram)}
			aria-label="Dashboard setup: create Free and Pro plans, define features, set monthly message allowances, and configure plan behavior."
		>
			<ol className={styles.steps}>
				{STEPS.map(({ title, rows }, index) => (
					<CatalogWorkflowStep key={title} step={index + 1} title={title}>
						<div className={styles.textRows}>
							{rows.map((row) => (
								<span key={row}>{row}</span>
							))}
						</div>
					</CatalogWorkflowStep>
				))}
			</ol>
		</figure>
	);
}
