"use client";

import { cn } from "@/lib/utils";
import styles from "./evalConversation.module.css";
import { EvalTranscript } from "./evalTranscript";
import { useEvalConversationLoop } from "./useEvalConversationLoop";

export function EvalConversation() {
	const ref = useEvalConversationLoop();

	return (
		<figure
			ref={ref}
			className={cn("not-prose", styles.terminal)}
			aria-label="Eval conversation: the agent asks the simulated user for missing plan prices."
		>
			<div className={styles.titlebar}>
				<span className={styles.title}>
					<span className={styles.prompt} aria-hidden="true">
						{">_"}
					</span>
					ax-evals
				</span>
				<span className={styles.filename}>missingPrice.eval.ts</span>
			</div>
			<EvalTranscript />
		</figure>
	);
}
