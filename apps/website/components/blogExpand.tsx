"use client";

import { AnimatePresence, motion } from "motion/react";
import { type ReactNode, useEffect, useRef, useState } from "react";

export function Expand({
	id,
	title = "",
	children,
}: {
	id?: string;
	title?: string;
	children?: ReactNode;
}) {
	const [open, setOpen] = useState(false);
	const rootRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!id) return;

		const openIfMatches = () => {
			if (window.location.hash.slice(1) !== id) return;
			setOpen(true);
			requestAnimationFrame(() => {
				rootRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
			});
		};

		openIfMatches();
		window.addEventListener("hashchange", openIfMatches);
		return () => window.removeEventListener("hashchange", openIfMatches);
	}, [id]);

	return (
		<div
			id={id}
			ref={rootRef}
			className="my-4 rounded-lg border border-[#292929] bg-[#141414] scroll-mt-24"
		>
			<button
				type="button"
				onClick={() => setOpen((o) => !o)}
				className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-[15px] font-medium text-white transition-colors hover:bg-[#1a1a1a] rounded-lg"
			>
				{title}
				<motion.svg
					width="16"
					height="16"
					viewBox="0 0 16 16"
					fill="none"
					animate={{ rotate: open ? 180 : 0 }}
					transition={{ duration: 0.2 }}
					className="shrink-0 text-[#FFFFFF66]"
				>
					<path
						d="M4 6L8 10L12 6"
						stroke="currentColor"
						strokeWidth="1.5"
						strokeLinecap="round"
						strokeLinejoin="round"
					/>
				</motion.svg>
			</button>

			<AnimatePresence initial={false}>
				{open && (
					<motion.div
						initial={{ height: 0, opacity: 0 }}
						animate={{ height: "auto", opacity: 1 }}
						exit={{ height: 0, opacity: 0 }}
						transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
						className="overflow-hidden"
					>
						<div className="border-t border-[#292929] px-4 py-3 text-[14px] leading-relaxed text-[#E5E5E5] [&>p]:my-2 [&>p:first-child]:mt-0 [&>p:last-child]:mb-0">
							{children}
						</div>
					</motion.div>
				)}
			</AnimatePresence>
		</div>
	);
}
