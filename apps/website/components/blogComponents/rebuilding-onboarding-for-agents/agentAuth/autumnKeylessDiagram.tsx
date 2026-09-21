import { cn } from "@/lib/utils";
import styles from "./agentAuthDiagram.module.css";
import { AuthDiagramIcon } from "./authDiagramIcon";
import { AuthSequence } from "./authSequence";
import { AuthSequenceMessage } from "./authSequenceMessage";

export function AutumnKeylessDiagram() {
	return (
		<figure
			className={cn("not-prose", styles.diagram)}
			aria-label="Autumn keyless onboarding: the agent provisions a sandbox organization and receives its API key, then builds the catalog and integrates the app. Later, it shares a claim link. The user verifies their identity and claims the organization. The same organization, catalog, and API key keep working."
		>
			<AuthSequence
				title="Autumn"
				subtitle="Keyless onboarding"
				service="Autumn"
			>
				<AuthSequenceMessage direction="request" label="Provision sandbox" />
				<AuthSequenceMessage direction="response" label="Org + API key" />
				<AuthSequenceMessage
					direction="request"
					label="Build + integrate"
					detail="Using the org’s API key"
				/>
				<div className={styles.timeBreak}>
					<span>Later</span>
				</div>
				<AuthSequenceMessage direction="handoff" label="Claim link" />
				<AuthSequenceMessage direction="claim" label="Verify + claim org" />
				<div className={styles.continuity}>
					<AuthDiagramIcon kind="key" />
					<span>Same org. Same API key.</span>
					<span className={styles.ownerLinked}>
						<AuthDiagramIcon kind="check" /> Owner linked
					</span>
				</div>
			</AuthSequence>
		</figure>
	);
}
