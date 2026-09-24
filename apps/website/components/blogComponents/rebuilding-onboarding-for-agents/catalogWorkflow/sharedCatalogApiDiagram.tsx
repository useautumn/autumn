import { cn } from "@/lib/utils";
import workflow from "./catalogWorkflow.module.css";
import styles from "./sharedCatalogApiDiagram.module.css";

export function SharedCatalogApiDiagram() {
	return (
		<figure
			className={cn("not-prose", workflow.diagram, styles.apiDiagram)}
			aria-label="The dashboard and CLI both send catalog changes to catalog.update, sharing one set of catalog logic. Either path adds 100 monthly messages to the Pro plan."
		>
			<div className={styles.apiLayout}>
				<div className={styles.sources}>
					<section className={styles.apiCard} aria-label="Dashboard input">
						<h4 className={styles.sourceTitle}>
							Dashboard <span className={styles.sourcePlan}>Pro</span>
						</h4>
						<div className={styles.dashboardEditor}>
							<span>Messages</span>
							<span className={styles.allowanceInput}>
								100 <span>/ mo</span>
							</span>
						</div>
					</section>
					<section className={styles.apiCard} aria-label="CLI input">
						<h4 className={styles.sourceTitle}>
							CLI <span className={styles.sourcePlan}>Pro</span>
						</h4>
						<pre className={styles.inputCode}>
							<code>
								<span className={styles.fileComment}>
									{"// autumn.config.ts\n"}
								</span>
								{"items: [{\n  featureId: "}
								<span className={workflow.accent}>{'"messages"'}</span>
								{",\n  included: "}
								<span className={workflow.accent}>100</span>
								{',\n  reset: { interval: "month" }\n}]'}
							</code>
						</pre>
					</section>
				</div>
				<svg
					className={styles.mergeConnector}
					viewBox="0 0 56 280"
					fill="none"
					aria-hidden="true"
				>
					<path d="M6 48H12Q28 48 28 64V124Q28 140 44 140H50" />
					<path d="M6 196H12Q28 196 28 180V156Q28 140 44 140" />
					<path d="m46 136 4 4-4 4" />
				</svg>
				<div className={styles.sharedEndpoint}>
					<div className={cn(styles.apiCard, styles.endpointCard)}>
						<code>catalog.update</code>
					</div>
					<span className={styles.endpointCaption}>Shared catalog logic</span>
				</div>
				<svg
					className={styles.outputConnector}
					viewBox="0 0 40 16"
					fill="none"
					aria-hidden="true"
				>
					<path d="M6 8H34m-4-4 4 4-4 4" />
				</svg>
				<section
					className={cn(styles.apiCard, styles.resultCard)}
					aria-label="Updated Pro plan: 100 messages per month"
				>
					<h4 className={styles.sourceTitle}>
						Pro
						<svg
							className={styles.successMark}
							viewBox="0 0 16 16"
							fill="none"
							aria-hidden="true"
						>
							<path d="m3 8 3 3 7-7" />
						</svg>
					</h4>
					<div className={styles.resultFeature}>
						<span>Messages</span>
						<span>
							<span className={workflow.accent}>100</span>
							<span className={styles.interval}> / mo</span>
						</span>
					</div>
				</section>
			</div>
		</figure>
	);
}
