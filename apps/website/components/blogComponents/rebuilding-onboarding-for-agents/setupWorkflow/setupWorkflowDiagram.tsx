import { cn } from "@/lib/utils";
import styles from "./setupWorkflowDiagram.module.css";

const steps = [
	{
		title: "Check the project",
		detail: "Find existing config, key, and pricing. Skip what’s already done.",
	},
	{
		title: "Connect to Autumn",
		detail:
			"Reuse the key, sign in, or start a keyless sandbox with atmn init.",
		reference: "references/keyless.md",
	},
	{
		title: "Gather pricing",
		detail: "Get rough plans and prices. Leave the modeling to catalog.",
	},
	{
		title: "Model, write, approve",
		skill: "catalog",
		detail: "Agreed structure → valid config → user approval.",
	},
	{
		title: "Push + verify",
		detail: "Push the approved config. Verify every plan and feature.",
	},
	{
		title: "Integrate + test",
		condition: "If requested",
		skill: "integrate",
		detail: "Create a customer, buy a plan, and verify check + track.",
	},
	{
		title: "Link the account",
		condition: "Keyless · optional",
		detail: "Verify by email and code. Keep the same org, key, and catalog.",
	},
	{
		title: "Wrap up",
		detail:
			"Summarize what works, the changed files, and next steps. Then stop.",
	},
];

export function SetupWorkflowDiagram() {
	return (
		<figure
			className={cn("not-prose", styles.diagram)}
			aria-label="The setup skill orchestrates eight phases, delegating catalog modeling and app integration to their own skills, then returning to the setup workflow."
		>
			<div className={styles.editor}>
				<div className={styles.fileHeader}>
					<svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
						<path d="M9.5 1.5h-6v13h9v-10l-3-3Zm0 0v3h3" />
					</svg>
					<span>setup.mdx</span>
					<span className={styles.fileLabel}>Workflow</span>
				</div>
				<div className={styles.document}>
					<div className={styles.documentTitle}>
						<span>
							<span className={styles.markdown} aria-hidden="true">
								#{" "}
							</span>
							Setup
						</span>
						<span className={styles.environment}>Sandbox by default</span>
					</div>
					<ol className={styles.steps}>
						{steps.map((step, index) => (
							<li className={styles.step} key={step.title}>
								<span className={styles.stepNumber} aria-hidden="true">
									{index + 1}
								</span>
								<div className={styles.stepContent}>
									<div className={styles.stepHeading}>
										<span className={styles.stepTitle}>
											<span className={styles.markdown} aria-hidden="true">
												##{" "}
											</span>
											{step.title}
										</span>
										{step.condition && (
											<span className={styles.condition}>{step.condition}</span>
										)}
									</div>
									{step.skill && (
										<div className={styles.skillCall}>
											<span className={styles.syntax}>{"<skill "}</span>
											<span>name=</span>
											<span
												className={styles.skillName}
											>{`"${step.skill}"`}</span>
											<span className={styles.syntax}>{" />"}</span>
										</div>
									)}
									<div className={styles.detail}>{step.detail}</div>
									{step.reference && (
										<div className={styles.reference}>
											<span aria-hidden="true">↳</span> {step.reference}
										</div>
									)}
								</div>
							</li>
						))}
					</ol>
				</div>
			</div>
		</figure>
	);
}
