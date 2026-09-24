import { cn } from "@/lib/utils";
import styles from "./catalogSkillWorkflowDiagram.module.css";

export function CatalogLicenseReference() {
	return (
		<section
			className={cn(styles.file, styles.reference)}
			aria-label="Licenses reference workflow"
		>
			<header className={cn(styles.fileHeader, styles.keyword)}>
				fork-licenses.md
			</header>
			<div className={styles.program}>
				<div>Ask what each unit comes with.</div>
				<div className={styles.block}>
					<div>
						<span className={styles.keyword}>If</span> own allowance or
						assignment:
					</div>
					<div className={styles.scope}>
						<div>Use one child license plan.</div>
						<div>Reuse across parent plans.</div>
						<div>Put differences on each link.</div>
					</div>
				</div>
				<div className={styles.block}>
					<div className={styles.keyword}>Otherwise:</div>
					<div className={styles.scope}>Use a per-unit item.</div>
				</div>
				<div className={styles.block}>
					<span className={styles.keyword}>Return</span> to modeling.
				</div>
			</div>
		</section>
	);
}
