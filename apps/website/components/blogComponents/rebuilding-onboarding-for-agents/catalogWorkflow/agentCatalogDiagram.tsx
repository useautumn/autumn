import { cn } from "@/lib/utils";
import { CatalogConfigPreview } from "./catalogConfigPreview";
import styles from "./catalogWorkflow.module.css";
import { CatalogWorkflowStep } from "./catalogWorkflowStep";

const CONVERSATION = [
	{ speaker: "You", text: "Pro: $20/mo. 500 messages.", fromUser: true },
	{ speaker: "Agent", text: "Per person or shared?", fromUser: false },
	{ speaker: "You", text: "Shared by the team.", fromUser: true },
];

export function AgentCatalogDiagram() {
	return (
		<figure
			className={cn("not-prose", styles.diagram)}
			aria-label="Agent setup: clarify that Pro's 500 monthly messages are shared by the team, define the complete catalog in autumn.config.ts, then push and confirm it through the Autumn CLI."
		>
			<ol className={cn(styles.steps, styles.agentSteps)}>
				<CatalogWorkflowStep step={1} title="Discuss pricing">
					<div className={styles.conversation}>
						{CONVERSATION.map(({ speaker, text, fromUser }) => (
							<div
								className={cn(styles.message, fromUser && styles.userMessage)}
								key={text}
							>
								<span className="sr-only">{speaker}: </span>
								<p>{text}</p>
							</div>
						))}
					</div>
				</CatalogWorkflowStep>
				<CatalogWorkflowStep step={2} title="Write config">
					<CatalogConfigPreview />
				</CatalogWorkflowStep>
				<CatalogWorkflowStep step={3} title="Push to Autumn">
					<div className={styles.push}>
						<div>
							<div className={styles.command}>
								<span aria-hidden="true">$</span> atmn push
							</div>
						</div>
						<div className={styles.syncedPlans}>
							{["Free", "Pro"].map((name) => (
								<div key={name} className={styles.syncedPlan}>
									<span className={name === "Pro" ? styles.accent : undefined}>
										{name}
									</span>
									<span className={styles.planLines} aria-hidden="true" />
								</div>
							))}
						</div>
						<div className={styles.synced}>
							<span aria-hidden="true">✓</span> Catalog synced
						</div>
					</div>
				</CatalogWorkflowStep>
			</ol>
		</figure>
	);
}
