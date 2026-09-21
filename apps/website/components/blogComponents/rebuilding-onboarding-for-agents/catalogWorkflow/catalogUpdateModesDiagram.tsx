import { cn } from "@/lib/utils";
import styles from "./catalogUpdateModesDiagram.module.css";
import { CatalogVersionDiff } from "./catalogVersionDiff";
import workflow from "./catalogWorkflow.module.css";

export function CatalogUpdateModesDiagram() {
	return (
		<figure
			className={cn("not-prose", workflow.diagram, styles.modesDiagram)}
			aria-label="With PATCH, edit Pro v3, choose side effects, apply to all versions, then pull changes to v1 and v2 back into the config. With PUT, define 100 monthly messages in all three versions directly in the config."
		>
			<div className={styles.modesLayout}>
				<section className={styles.patchPanel} aria-label="PATCH workflow">
					<h4 className={styles.modeHeading}>
						<span className={styles.methodLabel}>PATCH</span>
					</h4>
					<div className={styles.patchFlow}>
						<div className={cn(styles.flowCard, styles.editCard)}>
							<h5>Edit config</h5>
							<span>Pro v3</span>
							<span className={styles.flowDetail}>100 messages / mo</span>
						</div>
						<svg
							className={styles.loopArrows}
							viewBox="0 0 314 318"
							fill="none"
							aria-hidden="true"
						>
							<path d="M147 58H167m-4-4 4 4-4 4" />
							<path d="M242.5 122V196m-4-4 4 4 4-4" />
							<path className={styles.returnArrow} d="M167 260H147" />
							<path d="m151 256-4 4 4 4" />
							<path className={styles.returnArrow} d="M71.5 196V122" />
							<path d="m67.5 126 4-4 4 4" />
						</svg>
						<div className={cn(styles.flowCard, styles.decideCard)}>
							<h5>Choose effects</h5>
							<span>All versions?</span>
							<span>New version?</span>
							<span>Migrate customers?</span>
						</div>
						<div className={cn(styles.flowCard, styles.applyCard)}>
							<h5>Apply</h5>
							<div className={styles.versionTags}>
								{[1, 2, 3].map((version) => (
									<span key={version}>v{version}</span>
								))}
							</div>
							<span className={styles.flowDetail}>100 messages / mo</span>
						</div>
						<div className={cn(styles.flowCard, styles.pullCard)}>
							<h5>Pull changes</h5>
							<div className={styles.versionTags}>
								{[1, 2].map((version) => (
									<span key={version}>v{version}</span>
								))}
							</div>
							<span className={styles.flowDetail}>Back into the config</span>
						</div>
					</div>
				</section>
				<section className={styles.putPanel} aria-label="PUT workflow">
					<h4 className={styles.modeHeading}>
						<span className={styles.methodLabel}>PUT</span>
					</h4>
					<div className={styles.configPane}>
						<div className={styles.versionDiffs}>
							{[1, 2, 3].map((version) => (
								<CatalogVersionDiff key={version} version={version} />
							))}
						</div>
					</div>
				</section>
			</div>
		</figure>
	);
}
