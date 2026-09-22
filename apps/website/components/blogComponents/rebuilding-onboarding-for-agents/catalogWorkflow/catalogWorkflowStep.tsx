import type { ReactNode } from "react";
import styles from "./catalogWorkflow.module.css";

export function CatalogWorkflowStep({
	step,
	title,
	children,
}: {
	step: number;
	title: string;
	children: ReactNode;
}) {
	return (
		<li className={styles.step}>
			<h4 className={styles.heading}>
				<span className={styles.stepNumber}>{step}</span>
				{title}
			</h4>
			<div className={styles.content}>{children}</div>
		</li>
	);
}
