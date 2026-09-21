import { cn } from "@/lib/utils";
import styles from "./agentDocsDiagram.module.css";
import { AgentDocsFileIcon } from "./agentDocsFileIcon";

const examples = [
	{
		tag: "docs",
		heading: "# Catalog",
		instruction: "Ask about pricing before writing the config.",
		attribute: "url",
		value: "/documentation/modelling-pricing/credit-systems",
		when: null,
		line: 1,
		result: "Inline docs",
		file: "SKILL.md",
		action: "Inline",
	},
	{
		tag: "reference",
		heading: "## Fill in the details",
		instruction: "Confirm when billing and allowances reset.",
		attribute: "url",
		value: "/documentation/modelling-pricing/recurring",
		when: "billing vs reset intervals",
		line: 8,
		result: "Local reference",
		file: "references/recurring.md",
		action: "Create",
	},
	{
		tag: "pointer",
		heading: "## Model paid seats",
		instruction: "Ask what each seat comes with.",
		attribute: "file",
		value: "../concepts/references/licenses.md",
		when: "modeling a license",
		line: 16,
		result: "Shared reference",
		file: "references/licenses.md",
		action: "Reuse",
	},
] as const;

export function AgentDocsDiagram() {
	return (
		<figure
			className={cn("not-prose", styles.diagram)}
			aria-label="Custom MDX tags compile into inline documentation, a local reference file, or a pointer to a reference in another skill."
		>
			<div className={styles.layout}>
				<div className={styles.editorHeader}>
					<AgentDocsFileIcon />
					<span>catalog.mdx</span>
					<span className={styles.exampleLabel}>Source</span>
				</div>
				<div className={styles.outputHeader}>Compiled output</div>
				{examples.map((example) => (
					<div className={styles.row} key={example.tag}>
						<div className={styles.source}>
							<div className={styles.sourceIntro}>
								<span className={styles.lineNumber} aria-hidden="true">
									{example.line}
								</span>
								<span className={styles.markdownHeading}>
									{example.heading}
								</span>
								<span className={styles.lineNumber} aria-hidden="true">
									{example.line + 1}
								</span>
								<span className={styles.sourceInstruction}>
									{example.instruction}
								</span>
							</div>
							<div className={styles.tagBlock}>
								<span className={styles.lineNumber} aria-hidden="true">
									{example.line + 3}
								</span>
								<div className={styles.tagName}>{`<${example.tag}`}</div>
								<span className={styles.lineNumber} aria-hidden="true">
									{example.line + 4}
								</span>
								<div className={styles.attribute}>
									<span>{example.attribute}=</span>
									<span className={styles.value}>
										{'"'}
										{example.value.split(/(?<=\/)/).map((segment) => (
											<span className={styles.pathSegment} key={segment}>
												{segment}
											</span>
										))}
										{'"'}
									</span>
								</div>
								{example.when && (
									<>
										<span className={styles.lineNumber} aria-hidden="true">
											{example.line + 5}
										</span>
										<div className={styles.attribute}>
											<span>when=</span>
											<span
												className={styles.value}
											>{`"${example.when}"`}</span>
										</div>
									</>
								)}
								<span className={styles.lineNumber} aria-hidden="true">
									{example.line + (example.when ? 6 : 5)}
								</span>
								<div className={styles.tagName}>{"/>"}</div>
								<div className={styles.connector} aria-hidden="true">
									<svg
										aria-hidden="true"
										viewBox="0 0 25 16"
										fill="none"
										stroke="currentColor"
									>
										<path d="M3 8h18m-4-4 4 4-4 4" />
									</svg>
								</div>
							</div>
						</div>
						<div className={styles.output}>
							<div className={styles.resultTitle}>{example.result}</div>
							<div className={styles.outputFile}>
								<div className={styles.fileHeader}>
									<span className={styles.fileName}>
										<AgentDocsFileIcon />
										{example.file}
									</span>
									<span className={styles.action}>{example.action}</span>
								</div>
								{example.tag === "docs" && (
									<div className={styles.documentExcerpt}>
										<div className={styles.documentTitle}>
											## Credit Systems
										</div>
										<div>
											Credit systems let you track actions with different credit
											costs from a single balance pool.
										</div>
										<span className={styles.ellipsis}>…</span>
									</div>
								)}
								{example.tag === "reference" && (
									<div className={styles.fileDetail}>
										<span className={styles.detailSymbol} aria-hidden="true">
											+
										</span>
										<span>Saved alongside this skill</span>
									</div>
								)}
								{example.tag === "pointer" && (
									<div className={styles.fileDetail}>
										<span className={styles.detailSymbol} aria-hidden="true">
											↗
										</span>
										<span>
											From{" "}
											<span className={styles.inlineCode}>autumn-concepts</span>
										</span>
									</div>
								)}
							</div>
							{example.when && (
								<div className={styles.emittedInstruction}>
									<span className={styles.instructionLabel}>In SKILL.md</span>
									<div>
										For {example.when}, read{" "}
										<span className={styles.inlineCode}>{example.file}</span>
										{example.tag === "pointer" && (
											<>
												{" "}
												in the{" "}
												<span className={styles.inlineCode}>
													autumn-concepts
												</span>{" "}
												skill
											</>
										)}
										.
									</div>
								</div>
							)}
						</div>
					</div>
				))}
			</div>
		</figure>
	);
}
