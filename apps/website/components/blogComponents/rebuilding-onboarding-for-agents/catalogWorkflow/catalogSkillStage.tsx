import type { ReactNode } from "react";
import styles from "./catalogSkillWorkflowDiagram.module.css";

export function CatalogSkillStage({
	number,
	title,
	children,
}: {
	number: string;
	title: string;
	children: ReactNode;
}) {
	return (
		<li className={styles.stage}>
			<h5 className={styles.stageHeading}>
				<span className={styles.stageNumber}>{number}</span>
				{title}
			</h5>
			<div className={styles.stageContent}>{children}</div>
		</li>
	);
}
