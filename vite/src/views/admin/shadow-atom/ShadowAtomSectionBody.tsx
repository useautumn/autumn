import type { ReactNode } from "react";
import { ShadowAtomLoadError } from "./ShadowAtomLoadError";

export const ShadowAtomSectionBody = ({
	isError,
	isPending,
	what,
	onRetry,
	children,
}: {
	isError: boolean;
	isPending: boolean;
	what: string;
	onRetry: () => void;
	children: ReactNode;
}) => {
	if (isError) return <ShadowAtomLoadError what={what} onRetry={onRetry} />;
	if (isPending)
		return <div className="h-24 animate-pulse rounded-lg bg-muted" />;
	return children;
};
