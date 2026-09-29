import type { ReactNode } from "react";
import { ConfigRow } from "../ConfigRow";

export function AdvancedToggleRow({
	label,
	description,
	children,
}: {
	label: string;
	description?: string;
	children: ReactNode;
}) {
	return (
		<ConfigRow title={label} description={description} action={children} />
	);
}
