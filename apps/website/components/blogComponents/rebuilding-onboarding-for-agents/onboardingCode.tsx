import styles from "./onboardingDiagram.module.css";

const TOKEN_PATTERN = /("[^"\n]*"|\b(?:const|await|if)\b|\b\d+\b)/g;

function getTokenClass(token: string) {
	if (token.startsWith('"')) return styles.string;
	if (/^\d+$/.test(token)) return styles.number;
	if (/^(const|await|if)$/.test(token)) return styles.keyword;
	return undefined;
}

export function OnboardingCode({
	filename,
	code,
}: {
	filename: string;
	code: string;
}) {
	return (
		<div className={styles.editor}>
			<pre className={styles.code}>
				<code>
					<span className={styles.comment}>{`// ${filename}`}</span>
					{"\n\n"}
					{code.split(TOKEN_PATTERN).map((token, index) => (
						<span key={`${index}-${token}`} className={getTokenClass(token)}>
							{token}
						</span>
					))}
				</code>
			</pre>
		</div>
	);
}
