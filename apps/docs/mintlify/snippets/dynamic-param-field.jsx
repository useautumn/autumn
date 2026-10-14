export const DynamicParamField = ({ children, body, path, ...props }) => {
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

	const resolvedBody = useMemo(() => {
		try {
			const value = JSON.parse(lang);
			const useCamelCase = value === "typescript";
			return useCamelCase ? convertToCamelCase(body) : body;
		} catch {
			return body;
		}
	}, [body, lang]);

	const resolvedPath = useMemo(() => {
		try {
			const value = JSON.parse(lang);
			const useCamelCase = value === "typescript";
			return useCamelCase ? convertToCamelCase(path) : path;
		} catch {
			return path;
		}
	}, [path, lang]);

	return (
		<ParamField body={resolvedBody} path={resolvedPath} {...props}>
			{children}
		</ParamField>
	);
};
