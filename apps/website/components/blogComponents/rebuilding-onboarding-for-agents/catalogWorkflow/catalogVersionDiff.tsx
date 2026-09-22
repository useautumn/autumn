import styles from "./catalogUpdateModesDiagram.module.css";

export function CatalogVersionDiff({ version }: { version: number }) {
	return (
		<pre className={styles.versionDiff}>
			<code>
				<span className={styles.diffComment}>{`// Pro v${version}\n`}</span>
				<span className={styles.diffLine}>{"items: [{\n"}</span>
				<span className={styles.addedLine}>
					<span aria-hidden="true">+</span>
					{'  featureId: "messages",\n'}
				</span>
				<span className={styles.addedLine}>
					<span aria-hidden="true">+</span>
					{"  included: 100,\n"}
				</span>
				<span className={styles.addedLine}>
					<span aria-hidden="true">+</span>
					{'  reset: { interval: "month" },\n'}
				</span>
				<span className={styles.diffLine}>{"}]"}</span>
			</code>
		</pre>
	);
}
