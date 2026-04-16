"use client";
import gsap from "gsap";
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import type { IconComponent, NavIconHandle } from "./website-types";

const BRAILLE_FRAMES = [
	"\u2800\u2836\u2800",
	"\u2830\u28FF\u2806",
	"\u28BE\u28C9\u2877",
	"\u28CF\u2800\u28F9",
	"\u2841\u2800\u2888",
] as const;

export const DashboardIconPixel = forwardRef<
	NavIconHandle,
	{ Icon: IconComponent }
>(function DashboardIconPixel({ Icon }, ref) {
	const iconRef = useRef<HTMLDivElement>(null);
	const pulseRef = useRef<HTMLDivElement>(null);
	const tlRef = useRef<gsap.core.Timeline | null>(null);

	useImperativeHandle(ref, () => ({
		restart: () => tlRef.current?.play(),
		reverse: () => tlRef.current?.reverse(),
	}));

	useEffect(() => {
		const pixels = iconRef.current?.querySelectorAll(".icon-pixel-path");
		const pulseEl = pulseRef.current;
		if (!pixels || !pulseEl) return;

		gsap.set(pixels, {
			opacity: 0.25,
			scale: 0.8,
			transformOrigin: "left bottom",
		});
		gsap.set(pulseEl, { opacity: 0 });

		tlRef.current = gsap
			.timeline({ paused: true })
			.to(pixels, { opacity: 0, duration: 0.05 })
			.to(pulseEl, { opacity: 1, duration: 0.05 }, "<")
			.to(pulseEl, {
				duration: 0.2,
				onUpdate: function () {
					pulseEl.innerText =
						BRAILLE_FRAMES[
							Math.floor(this.progress() * (BRAILLE_FRAMES.length - 1))
						];
				},
			})
			.to(pulseEl, { opacity: 0, duration: 0.1 })
			.to(
				pixels,
				{
					opacity: 1,
					scale: 1,
					duration: 0.2,
					stagger: { grid: [5, 5], from: [0, 4], amount: 0.2 },
				},
				"-=0.1",
			);
	}, []);

	return (
		<span className="relative inline-flex items-center justify-center w-[14px] h-[14px]">
			<div
				ref={pulseRef}
				className="absolute z-20 font-mono text-[14px] text-white opacity-0"
			/>
			<div ref={iconRef} className="w-full h-full text-white">
				<Icon className="w-full h-full text-white" />
			</div>
		</span>
	);
});
