import { cn } from "@/lib/utils";
import styles from "./evalConversation.module.css";
import transcript from "./recordedTranscript.json";

export function EvalTranscript() {
	return (
		<section
			className={styles.viewport}
			aria-label="Recorded eval terminal output"
		>
			<pre className={styles.output}>
				{transcript.map((block) => (
					<span
						key={block.id}
						className={styles.block}
						data-turn-at={block.at ?? undefined}
					>
						{block.lines.map((line) => (
							<span key={line.id} className={styles.line} data-kind={line.kind}>
								<span className={styles.gutter} aria-hidden="true">
									{line.gutter.map((token) => token.text).join("")}
								</span>
								<span
									className={cn(
										styles.content,
										line.marker && styles.checklist,
									)}
								>
									{line.marker && <span>{line.marker}</span>}
									<span>
										{line.content.map((token) => (
											<span
												key={token.id}
												className={cn(
													styles[token.tone],
													token.bold && styles.bold,
												)}
											>
												{token.text}
											</span>
										))}
									</span>
								</span>
							</span>
						))}
					</span>
				))}
			</pre>
		</section>
	);
}
