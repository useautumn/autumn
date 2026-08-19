"use client";

import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";

export const volumeTiers = [
	{ label: "8K", plan: "FREE", proPrice: "375", proVolume: "50K" },
	{ label: "50K", plan: "PRO", proPrice: "375", proVolume: "50K" },
	{ label: "200K", plan: "PRO", proPrice: "995", proVolume: "200K" },
	{ label: "400K", plan: "PRO", proPrice: "1,495", proVolume: "400K" },
	{ label: "500K+", plan: "SCALE", proPrice: "1,495", proVolume: "400K" },
] as const;

export type VolumeTier = (typeof volumeTiers)[number];

export const defaultVolumeTierIndex = 1;

// Matches the thumb in globals.css (12px box + 1px border each side).
const THUMB_SIZE = 14;

export default function VolumeSlider({
	tierIndex,
	onChange,
}: {
	tierIndex: number;
	onChange: (index: number) => void;
}) {
	const progress = tierIndex / (volumeTiers.length - 1);

	return (
		<div className="w-full">
			<span className="block mb-4 font-mono text-[12px] md:text-[14px] uppercase tracking-[-1%] text-[#FFFFFF99]">
				Monthly billing volume
			</span>

			<input
				type="range"
				min={0}
				max={volumeTiers.length - 1}
				step={1}
				value={tierIndex}
				onChange={(e) => onChange(Number(e.target.value))}
				aria-label="Monthly billing volume"
				className="volume-slider"
				style={{ "--slider-progress": progress } as CSSProperties}
			/>

			<div className="relative mt-3 h-[20px]">
				{volumeTiers.map((tier, i) => {
					const stop = i / (volumeTiers.length - 1);

					return (
						<button
							key={tier.label}
							type="button"
							onClick={() => onChange(i)}
							style={{
								left: `calc(${THUMB_SIZE / 2}px + ${stop} * (100% - ${THUMB_SIZE}px))`,
							}}
							className={cn(
								"absolute top-0 -translate-x-1/2 font-mono text-[12px] md:text-[14px] uppercase tracking-[-1%] cursor-pointer transition-colors whitespace-nowrap",
								i === tierIndex
									? "text-white"
									: "text-[#FFFFFF66] hover:text-white",
							)}
						>
							{tier.label}
						</button>
					);
				})}
			</div>
		</div>
	);
}
