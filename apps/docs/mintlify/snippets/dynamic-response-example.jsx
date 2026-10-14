export const DynamicResponseExample = ({ json, statusCode = "200" }) => {
	const toCamelCase = (str) => {
		return str.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
	};

	const convertKeysToCamelCase = (obj) => {
		if (Array.isArray(obj)) {
			return obj.map((item) => convertKeysToCamelCase(item));
		}
		if (obj !== null && typeof obj === "object") {
			return Object.keys(obj).reduce((acc, key) => {
				const camelKey = toCamelCase(key);
				acc[camelKey] = convertKeysToCamelCase(obj[key]);
				return acc;
			}, {});
		}
		return obj;
	};

	const [isTypeScript, setIsTypeScript] = useState(() => {
		if (typeof window !== "undefined") {
			try {
				const lang = localStorage.getItem("code");
				return JSON.parse(lang) === "typescript";
			} catch {
				return true;
			}
		}
		return true;
	});

	useEffect(() => {
		const onMintlifyStorage = (event) => {
			if (event.detail?.key === "code") {
				try {
					const value = JSON.parse(event.detail.value);
					setIsTypeScript(value === "typescript");
				} catch {
				}
			}
		};

		const pollInterval = setInterval(() => {
			try {
				const lang = localStorage.getItem("code");
				const value = JSON.parse(lang);
				setIsTypeScript(value === "typescript");
			} catch {
			}
		}, 300);

		document.addEventListener("mintlify-localstorage", onMintlifyStorage);

		return () => {
			document.removeEventListener("mintlify-localstorage", onMintlifyStorage);
			clearInterval(pollInterval);
		};
	}, []);

	const camelCaseJson = useMemo(() => convertKeysToCamelCase(json), [json]);

	const snakeCaseString = JSON.stringify(json, null, 2);
	const camelCaseString = JSON.stringify(camelCaseJson, null, 2);

	return (
		<ResponseExample>
			{isTypeScript ? (
				<CodeBlock language="json" filename={statusCode}>
					{camelCaseString}
				</CodeBlock>
			) : (
				<CodeBlock language="json" filename={statusCode}>
					{snakeCaseString}
				</CodeBlock>
			)}
		</ResponseExample>
	);
};
