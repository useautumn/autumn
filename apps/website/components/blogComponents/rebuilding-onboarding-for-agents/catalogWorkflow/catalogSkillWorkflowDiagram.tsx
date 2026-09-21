import { cn } from "@/lib/utils";
import { CatalogLicenseReference } from "./catalogLicenseReference";
import { CatalogSkillProgram } from "./catalogSkillProgram";
import styles from "./catalogSkillWorkflowDiagram.module.css";
import workflow from "./catalogWorkflow.module.css";

export function CatalogSkillWorkflowDiagram() {
	return (
		<figure
			className={cn("not-prose", workflow.diagram, styles.skillDiagram)}
			aria-label="The catalog skill in four stages: gather pricing facts; model licenses, variants, add-ons, and shared balances through references; check and agree on the structure; then fill and validate the config. The licenses reference is expanded as a function call that returns to modeling."
		>
			<div className={styles.skillLayout}>
				<CatalogSkillProgram />
				<CatalogLicenseReference />
				<svg
					className={styles.connectors}
					viewBox="0 0 1000 742"
					preserveAspectRatio="none"
					aria-hidden="true"
				>
					<path d="M592 240H604Q612 240 612 232V218Q612 210 620 210H628m-4-3 4 3-4 3" />
					<path
						className={styles.returnArrow}
						d="M631 494H620Q612 494 612 486V276Q612 268 604 268H596"
					/>
					<path d="m600 265-4 3 4 3" />
				</svg>
			</div>
		</figure>
	);
}
