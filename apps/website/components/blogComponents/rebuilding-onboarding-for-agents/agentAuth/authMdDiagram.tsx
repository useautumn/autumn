import { cn } from "@/lib/utils";
import styles from "./agentAuthDiagram.module.css";
import { AuthSequence } from "./authSequence";
import { AuthSequenceMessage } from "./authSequenceMessage";

export function AuthMdDiagram() {
	return (
		<figure
			className={cn("not-prose", styles.diagram)}
			aria-label="auth.md anonymous start: the agent registers, exchanges its identity assertion for an access token, and calls the service before the user signs in. Later, the agent shares a claim link and code. The user signs in and confirms the code, and the agent receives a token with user-linked scopes."
		>
			<AuthSequence
				title="auth.md"
				subtitle="Anonymous start"
				service="Service"
			>
				<AuthSequenceMessage direction="request" label="Register anonymously" />
				<AuthSequenceMessage direction="response" label="Identity assertion" />
				<AuthSequenceMessage direction="request" label="Exchange assertion" />
				<AuthSequenceMessage direction="response" label="OAuth access token" />
				<AuthSequenceMessage
					direction="request"
					label="API calls"
					detail="Pre-claim permissions"
				/>
				<div className={styles.timeBreak}>
					<span>Later</span>
				</div>
				<AuthSequenceMessage direction="handoff" label="Claim link + code" />
				<AuthSequenceMessage direction="claim" label="Sign in + confirm code" />
				<AuthSequenceMessage
					direction="response"
					label="Token with user scopes"
				/>
			</AuthSequence>
		</figure>
	);
}
