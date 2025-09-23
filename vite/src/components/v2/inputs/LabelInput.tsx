import type React from "react";
import { useId } from "react";
import { Input } from "./Input";

export const LabelInput = ({
	label,
	placeholder,
	...props
}: {
	label: string | React.ReactElement<typeof HTMLSpanElement>;
	placeholder: string;
} & React.ComponentProps<"input">) => {
	const inputId = useId();

	return (
		<div>
			<div className="text-form-label block mb-1">{label}</div>
			<Input id={inputId} placeholder={placeholder} {...props} />
		</div>
	);
};
