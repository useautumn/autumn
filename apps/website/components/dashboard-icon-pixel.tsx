"use client";
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import type { PixelHoverHandle, PixelIconComponent } from "@/lib/types";
import { getGsap } from "@/lib/lazyGsap";

type GSAPTimeline = {
	play: () => GSAPTimeline;
	reverse: () => GSAPTimeline;
	kill: () => void;
	// biome-ignore lint/suspicious/noExplicitAny: structural shim for GSAP's overloaded .to() signature
	to: (...args: any[]) => GSAPTimeline;
};

export const DashboardIconPixel = forwardRef<
	PixelHoverHandle,
	{ Icon: PixelIconComponent }
>(function DashboardIconPixel({ Icon }, ref) {
	const iconRef = useRef<SVGSVGElement | null>(null);
	const tlRef = useRef<GSAPTimeline | null>(null);

	useImperativeHandle(ref, () => ({
		restart: () => tlRef.current?.play(),
		reverse: () => tlRef.current?.reverse(),
	}));

	useEffect(() => {
		const el = iconRef.current;
		if (!el) return;
		let cancelled = false;

		getGsap().then((gsap) => {
			if (cancelled) return;
			const pixelEls = el.querySelectorAll<SVGGraphicsElement>(".icon-pixel-path");
			if (!pixelEls.length) return;

			// Sort pixels by visual position: bottom-left → top-right diagonal
			const pixels = Array.from(pixelEls).sort((a, b) => {
				const aBox = a.getBBox();
				const bBox = b.getBBox();
				return (
					aBox.x + aBox.width / 2 - (aBox.y + aBox.height / 2) -
					(bBox.x + bBox.width / 2 - (bBox.y + bBox.height / 2))
				);
			});

			gsap.set(pixels, {
				opacity: 0.15,
				scale: 0.8,
				transformOrigin: "left bottom",
				fill: "currentColor",
			});

			tlRef.current = gsap.timeline({ paused: true });
			tlRef.current!
				.to(pixels, { opacity: 1, scale: 1.15, fill: "#FFFFFF", duration: 0.2, stagger: 0.01, ease: "power2.out" })
				.to(pixels, { scale: 1, duration: 0.01, ease: "back.out(3)" });
		});

		return () => {
			cancelled = true;
			tlRef.current?.kill();
		};
	}, []);

	return (
		<span className="relative inline-flex items-center justify-center w-[14px] h-[14px]">
			<Icon ref={iconRef} className="w-full h-full text-white" />
		</span>
	);
});
DashboardIconPixel.displayName = "DashboardIconPixel";
