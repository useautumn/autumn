import { useEffect, useMemo, useState } from "react";

/**
 * A wrapper around Mintlify's ResponseField that dynamically switches
 * between snake_case and camelCase based on the selected code language.
 *
 * - Node.js/TypeScript → camelCase (e.g., customerId)
 * - Python/cURL/others → snake_case (e.g., customer_id)
 */
export const DynamicResponseField = ({ children, name, ...props }) => {
	// Inline the toCamelCase function to avoid module scope issues with Mintlify's MDX compiler
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
		// Listen for Mintlify's custom localStorage event
		const onMintlifyStorage = (event) => {
			const key = event.detail?.key;
			if (key === "code") {
				setLang(event.detail.value);
			}
		};

		// Poll localStorage as a fallback (in case the event doesn't fire)
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
			// TypeScript uses camelCase, everything else (bash, python) uses snake_case
			const useCamelCase = value === "typescript";
			return useCamelCase ? convertToCamelCase(name) : name;
		} catch {
			return name;
		}
	}, [name, lang]);

	// Render the ResponseField with resolved name
	return (
		<ResponseField name={resolvedName} {...props}>
			{children}
		</ResponseField>
	);
};
