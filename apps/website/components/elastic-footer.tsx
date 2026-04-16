"use client";
import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import type { ReactNode } from "react";
import { useEffect } from "react";
import AnimatedFooterImage from "./animated-footer-image";

export default function ElasticRecoil({ children }: { children: ReactNode }) {
	const liftAmount = useMotionValue(0);

	const springConfig = { stiffness: 600, damping: 35, mass: 1 };
	const animatedLift = useSpring(liftAmount, springConfig);
	const y = useTransform(animatedLift, [0, 400], [0, -280]);

	useEffect(() => {
		let timeout: ReturnType<typeof setTimeout> | null = null;
		let recoilFired = false;
		let isTouching = false; // Track if finger is on screen

		const triggerRebound = () => {
			liftAmount.set(0);
			if (!recoilFired) {
				recoilFired = true;
				window.dispatchEvent(new CustomEvent("elastic-recoil"));
			}
		};

		const handleWheel = (e: WheelEvent) => {
			const isAtBottom =
				window.innerHeight + window.pageYOffset >=
				document.documentElement.scrollHeight - 5;

			if (isAtBottom && e.deltaY > 0) {
				liftAmount.set(liftAmount.get() + e.deltaY * 0.5);
				recoilFired = false;

				// Reset timeout on every wheel event
				if (timeout) clearTimeout(timeout);
				timeout = setTimeout(() => {
					if (!isTouching) {
						triggerRebound();
					}
				}, 1500); // Rebounds 1.5 seconds after wheel stops
			} else if (e.deltaY < 0) {
				if (!isTouching) {
					liftAmount.set(0);
					recoilFired = false;
				}
			}
		};

		let touchStart = 0;
		const handleTouchStart = (e: TouchEvent) => {
			isTouching = true;
			touchStart = e.touches[0].clientY;
			recoilFired = false;
			if (timeout) clearTimeout(timeout);
		};

		const handleTouchMove = (e: TouchEvent) => {
			const isAtBottom =
				window.innerHeight + window.pageYOffset >=
				document.documentElement.scrollHeight - 5;

			if (isAtBottom) {
				const touchDelta = touchStart - e.touches[0].clientY;
				if (touchDelta > 0) {
					liftAmount.set(touchDelta * 1.5);
					recoilFired = false;
					// Notice: We don't set a timeout here, so it never snaps back while touching
				}
			}
		};

		const handleTouchEnd = () => {
			isTouching = false;
			if (liftAmount.get() > 0) {
				if (timeout) clearTimeout(timeout);
				timeout = setTimeout(() => {
					triggerRebound();
				}, 1500); // Rebounds 1.5 seconds after lifting finger
			}
		};

		window.addEventListener("wheel", handleWheel, { passive: true });
		window.addEventListener("touchstart", handleTouchStart, { passive: true });
		window.addEventListener("touchmove", handleTouchMove, { passive: true });
		window.addEventListener("touchend", handleTouchEnd, { passive: true });
		window.addEventListener("touchcancel", handleTouchEnd, { passive: true });

		return () => {
			if (timeout) clearTimeout(timeout);
			window.removeEventListener("wheel", handleWheel);
			window.removeEventListener("touchstart", handleTouchStart);
			window.removeEventListener("touchmove", handleTouchMove);
			window.removeEventListener("touchend", handleTouchEnd);
			window.removeEventListener("touchcancel", handleTouchEnd);
		};
	}, [liftAmount]);

	return (
		<div className="relative w-full overflow-hidden">
			<AnimatedFooterImage />
			<motion.div style={{ y }} className="relative z-10 bg-black">
				{children}
			</motion.div>
		</div>
	);
}
