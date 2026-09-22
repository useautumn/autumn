import { cn } from "@/lib/utils";
import { CatalogSkillStage } from "./catalogSkillStage";
import styles from "./catalogSkillWorkflowDiagram.module.css";

const references = [
	{ pattern: "Paid seats / units", file: "fork-licenses.md" },
	{ pattern: "Volume tiers", file: "fork-variants.md" },
	{ pattern: "Packs / top-ups", file: "fork-addon.md" },
	{ pattern: "Shared balances", file: "fork-pooled.md" },
];

export function CatalogSkillProgram() {
	return (
		<section className={styles.file} aria-label="Catalog skill">
			<header className={styles.fileHeader}>catalog / SKILL.md</header>
			<ol className={styles.stages}>
				<CatalogSkillStage number="01" title="Gather the facts">
					<div>Plans → features → billing → paid units</div>
					<div>Where plans attach; who uses and shares.</div>
				</CatalogSkillStage>
				<CatalogSkillStage number="02" title="Shape the catalog">
					<div>
						<span className={styles.keyword}>For each</span> relevant pattern,
						read:
					</div>
					<div className={styles.scope}>
						{references.map(({ pattern, file }) => (
							<div
								key={file}
								className={cn(
									styles.referenceCall,
									file === "fork-licenses.md" && styles.callLine,
								)}
							>
								<span>{pattern}</span>
								<span className={styles.callArrow} aria-hidden="true">
									→
								</span>
								<span className={styles.keyword}>{file}</span>
							</div>
						))}
					</div>
				</CatalogSkillStage>
				<CatalogSkillStage number="03" title="Check and agree">
					<div>
						Check against <span className={styles.keyword}>cases.md</span>.
					</div>
					<div>Show structure + assumptions for approval.</div>
					<div>
						<span className={styles.keyword}>If corrected:</span> revisit
						affected decisions.
					</div>
					<div>Continue only when agreed.</div>
				</CatalogSkillStage>
				<CatalogSkillStage number="04" title="Fill and validate">
					<div>Reuse known values; ask for missing ones.</div>
					<div>Review remaining options once per catalog.</div>
					<div className={styles.optionExamples}>
						Rollover, overage, top-ups, limits…
					</div>
					<div>Propose + write the config.</div>
					<div>
						<span className={styles.keyword}>Repeat until</span> valid:
					</div>
					<div className={styles.scope}>Preview, validate, and fix.</div>
				</CatalogSkillStage>
			</ol>
		</section>
	);
}
