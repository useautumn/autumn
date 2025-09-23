import type { InputHTMLAttributes } from "react";
import { useEffect, useState } from "react";

interface InlineInputProps
	extends Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange"> {
	value: string | number;
	onChange: (value: string | number) => void;
	variant?: "violet" | "primary" | "muted";
	autoWidth?: boolean;
	minWidth?: string;
	maxWidth?: string;
	className?: string;
}

const variantStyles = {
	violet: {
		text: "text-violet-600",
		border: "border-violet-400",
		focusBorder: "focus:border-violet-500",
	},
	primary: {
		text: "text-primary",
		border: "border-primary",
		focusBorder: "focus:border-primary",
	},
	muted: {
		text: "text-foreground",
		border: "border-muted-foreground",
		focusBorder: "focus:border-foreground",
	},
};

export function InlineInput({
	value,
	onChange,
	variant = "violet",
	autoWidth = true,
	minWidth = "2rem",
	maxWidth = "8rem",
	className = "",
	type = "text",
	...props
}: InlineInputProps) {
	const [internalValue, setInternalValue] = useState(value);

	// Keep internal value in sync with external value
	useEffect(() => {
		setInternalValue(value);
	}, [value]);

	const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const newValue = e.target.value;
		setInternalValue(newValue);

		// Convert to number if input type is number
		if (type === "number") {
			const numValue = Number(newValue);
			onChange(Number.isNaN(numValue) ? 0 : numValue);
		} else {
			onChange(newValue);
		}
	};

	const styles = variantStyles[variant];

	// Calculate width based on content length
	const calculateWidth = () => {
		if (!autoWidth) return undefined;

		const contentLength = String(internalValue).length;
		const baseWidth = Math.max(2, contentLength * 0.6 + 1);
		return `${baseWidth}rem`;
	};

	return (
		<input
			{...props}
			type={type}
			value={internalValue}
			onChange={handleChange}
			className={`
				bg-transparent outline-none font-medium inline-block text-center
				border-0 border-b-2 border-solid transition-all duration-200 pb-0.5
				inline-input
				${styles.text} ${styles.border} ${styles.focusBorder}
				${className}
			`
				.trim()
				.replace(/\s+/g, " ")}
			style={{
				width: calculateWidth(),
				minWidth: autoWidth ? minWidth : undefined,
				maxWidth: autoWidth ? maxWidth : undefined,
				...props.style,
			}}
		/>
	);
}
