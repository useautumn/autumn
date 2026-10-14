export const DynamicResponseField = ({ children, name, ...props }) => {
	const convertToCamelCase = (str) => {
		if (typeof str !== "string") return str;
		return str.replace(/[_-](\w)/g, (_, c) => c.toUpperCase());
	};

	const [lang, setLang] = useState(() => {
		if (typeof window !== "undefined") {
			const stored = localStorage.getItem("code");
			return stored || '"typescript"';
		}
		return '"typescript"';
	});

	useEffect(() => {
		const onMintlifyStorage = (event) => {
			const key = event.detail?.key;
			if (key === "code") {
				setLang(event.detail.value);
			}
		};

		const pollInterval = setInterval(() => {
			const current = localStorage.getItem("code");
			if (current && current !== lang) {
				setLang(current);
			}
		}, 500);

		document.addEventListener("mintlify-localstorage", onMintlifyStorage);

		return () => {
			document.removeEventListener("mintlify-localstorage", onMintlifyStorage);
			clearInterval(pollInterval);
		};
	}, [lang]);

	const resolvedName = useMemo(() => {
		try {
			const value = JSON.parse(lang);
			const useCamelCase = value === "typescript";
			return useCamelCase ? convertToCamelCase(name) : name;
		} catch {
			return name;
		}
	}, [name, lang]);

	return (
		<ResponseField name={resolvedName} {...props}>
			{children}
		</ResponseField>
	);
};
