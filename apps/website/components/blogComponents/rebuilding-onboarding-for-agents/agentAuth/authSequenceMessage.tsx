import { cn } from "@/lib/utils";
import styles from "./agentAuthDiagram.module.css";

export function AuthSequenceMessage({
	direction,
	label,
	detail,
}: {
	direction: "request" | "response" | "handoff" | "claim";
	label: string;
	detail?: string;
}) {
	const directions = {
		request: "Agent to service",
		response: "Service to agent",
		handoff: "Agent to user",
		claim: "User to service",
	};

	return (
		<div className={cn(styles.message, styles[direction])}>
			<span className={styles.srOnly}>{directions[direction]}: </span>
			<span className={styles.messageLabel}>{label}</span>
			<span className={styles.messageArrow} aria-hidden="true" />
			{detail && <span className={styles.messageDetail}>{detail}</span>}
		</div>
	);
}
