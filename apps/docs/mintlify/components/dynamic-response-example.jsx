import { useEffect, useMemo, useState } from "react";

/**
 * A dynamic response example that shows JSON in the sidebar.
 * Displays two tabs (TypeScript/Response) and auto-switches based on selected language.
 *
 * - TypeScript selected → shows camelCase tab
 * - Python/cURL selected → shows snake_case tab
 */
export const DynamicResponseExample = ({ json, statusCode = "200" }) => {
	// Convert snake_case to camelCase
	const toCamelCase = (str) => {
		return str.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
	};

	// Recursively convert all object keys to camelCase
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
		// Listen for Mintlify's custom localStorage event
		const onMintlifyStorage = (event) => {
			if (event.detail?.key === "code") {
				try {
					const value = JSON.parse(event.detail.value);
					setIsTypeScript(value === "typescript");
				} catch {
					// ignore
				}
			}
		};

		// Poll localStorage as fallback
		const pollInterval = setInterval(() => {
			try {
				const lang = localStorage.getItem("code");
				const value = JSON.parse(lang);
				setIsTypeScript(value === "typescript");
			} catch {
				// ignore
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

	// Render tabs with CodeGroup-like behavior
	// Only one tab is "active" based on the selected language
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
