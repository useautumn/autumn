import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import styles from "./agentAuthDiagram.module.css";
import { AuthDiagramIcon } from "./authDiagramIcon";

export function AuthSequence({
	title,
	subtitle,
	service,
	children,
}: {
	title: string;
	subtitle: string;
	service: string;
	children: ReactNode;
}) {
	return (
		<div className={styles.canvas}>
			<div className={styles.heading}>
				<span className={styles.protocol}>{title}</span>
				<span className={styles.context}>{subtitle}</span>
			</div>
			<div className={styles.sequence}>
				<div className={styles.participants}>
					<div className={cn(styles.participant, styles.agent)}>
						<AuthDiagramIcon kind="agent" /> Agent
					</div>
					<div className={cn(styles.participant, styles.service)}>
						{service}
					</div>
					<div className={cn(styles.participant, styles.user)}>
						<AuthDiagramIcon kind="user" /> User
					</div>
				</div>
				<div className={styles.messages}>
					<div className={styles.lifelines} aria-hidden="true">
						<span />
						<span />
						<span />
					</div>
					{children}
				</div>
			</div>
		</div>
	);
}
