"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import { cn } from "@/lib/utils";

// Strong ease-out (animations skill) — built-in CSS easings feel weak.
export const EASE_OUT = [0.23, 1, 0.32, 1] as const;
export const ENTER = { duration: 0.26, ease: EASE_OUT };
export const LAYOUT = { duration: 0.3, ease: EASE_OUT };

export type ChangeId = "version" | "custom" | "tiers";

export type PlanRow = {
	id: string;
	type: string;
	price: string;
	credits: string;
	requires?: ChangeId;
};

export const PLAN_ROWS: PlanRow[] = [
	{ id: "free", type: "standard", price: "$0", credits: "50" },
	{ id: "pro_v1", type: "standard", price: "$20", credits: "200" },
	{
		id: "pro_v2",
		type: "standard",
		price: "$40",
		credits: "400",
		requires: "version",
	},
	{
		id: "acme_custom",
		type: "custom",
		price: "$50",
		credits: "500",
		requires: "custom",
	},
];

export type CustomerRow = { id: string; email: string; planId: string };

export const CUSTOMER_ROWS: CustomerRow[] = [
	{ id: "cus_01", email: "alex@acme.com", planId: "acme_custom" },
	{ id: "cus_02", email: "sam@beta.io", planId: "pro_v2" },
];

export function useApplied() {
	const [applied, setApplied] = useState<Set<ChangeId>>(new Set());
	const toggle = (id: ChangeId) =>
		setApplied((prev) => {
			const next = new Set(prev);
			if (next.has(id)) {
				next.delete(id);
			} else {
				next.add(id);
			}
			return next;
		});
	const reset = () => setApplied(new Set());
	return { applied, toggle, reset };
}

function CursorIcon() {
	return (
		<svg
			width="11"
			height="11"
			viewBox="0 0 16 16"
			fill="none"
			aria-hidden="true"
			className="shrink-0"
		>
			<path
				d="M3 2.5l8.5 5.2-3.7 1 -1 3.6z"
				fill="currentColor"
				stroke="currentColor"
				strokeWidth="1.2"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

// Shared pill used by inline triggers and both simulators' toolbars.
export function TogglePill({
	active,
	onClick,
	children,
}: {
	active: boolean;
	onClick: () => void;
	children: ReactNode;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			aria-pressed={active}
			className={cn(
				"mx-0.5 inline-flex items-center gap-1 rounded-md border px-1.5 py-px align-middle text-[0.78em] font-medium no-underline transition duration-200 active:scale-[0.97]",
				active
					? "border-[#9564ff] bg-[#9564ff26] text-white"
					: "border-[#2c2c2c] bg-[#161616] text-[#FFFFFF80] hover:border-[#3a3a3a] hover:bg-[#1c1c1c] hover:text-white",
			)}
		>
			<CursorIcon />
			{children}
		</button>
	);
}
