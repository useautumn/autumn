import styles from "./catalogWorkflow.module.css";

export function CatalogConfigPreview() {
	return (
		<pre className={styles.config}>
			<code>
				<span className={styles.comment}>{"// autumn.config.ts"}</span>
				<span className={styles.accent}>export default</span>
				{" atmn({\n"}
				{"  features,\n"}
				{"  plans: [free, pro],\n"}
				{"});"}
			</code>
		</pre>
	);
}
