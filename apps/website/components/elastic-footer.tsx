"use client";
import { motion, useMotionValue, useSpring, useTransform } from "motion/react";
import { useEffect, useRef, useState } from "react";
import type { LayoutProps } from "@/lib/types";
import AnimatedFooterImage from "./animated-footer-image";

export default function ElasticRecoil({ children }: LayoutProps) {
	const liftAmount = useMotionValue(0);

	const [showFooter, setShowFooter] = useState(false);
	const [isMobile, setIsMobile] = useState(false);
	const isMobileRef = useRef(false);

	useEffect(() => {
		const check = () => {
			const mobile = window.innerWidth < 768;
			setIsMobile(mobile);
			isMobileRef.current = mobile;
		};
		check();
		window.addEventListener("resize", check);
		return () => window.removeEventListener("resize", check);
	}, []);

	const desktopSpring = { stiffness: 200, damping: 15, mass: 0.5 };
	const mobileSpring = { stiffness: 800, damping: 60, mass: 0.2 };
	const animatedLift = useSpring(
		liftAmount,
		isMobile ? mobileSpring : desktopSpring,
	);
	const cappedMax = isMobile ? -420 : -580;
	const y = useTransform(animatedLift, [0, 400], [0, cappedMax]);

	useEffect(() => {
		return animatedLift.on("change", (v) => {
			setShowFooter(v > 1);
		});
	}, [animatedLift]);

	useEffect(() => {
		let timeout: ReturnType<typeof setTimeout> | null = null;
		let recoilFired = false;
		let isTouching = false;

		const triggerRebound = () => {
			liftAmount.set(0);
			if (!recoilFired) {
				recoilFired = true;
				window.dispatchEvent(new CustomEvent("elastic-recoil"));
			}
		};

		const handleWheel = (e: WheelEvent) => {
			if (isMobileRef.current) return;
			const isAtBottom =
				window.innerHeight + window.pageYOffset >=
				document.documentElement.scrollHeight - 5;

			if (isAtBottom && e.deltaY > 0) {
				const normalizedDelta =
					e.deltaMode === 1
						? e.deltaY * 20
						: e.deltaMode === 2
							? e.deltaY * 300
							: e.deltaY;
				liftAmount.set(Math.min(liftAmount.get() + normalizedDelta * 0.5, 400));
				recoilFired = false;

				if (timeout) clearTimeout(timeout);
				timeout = setTimeout(() => {
					if (!isTouching) {
						triggerRebound();
					}
				}, 1500);
			} else if (e.deltaY < 0) {
				if (!isTouching) {
					liftAmount.set(0);
					recoilFired = false;
				}
			}
		};

		let lastTouchY = 0;
		let atBottomOnStart = false;
		const handleTouchStart = (e: TouchEvent) => {
			if (isMobileRef.current) return;
			isTouching = true;
			lastTouchY = e.touches[0].clientY;
			atBottomOnStart =
				window.innerHeight + window.pageYOffset >=
				document.documentElement.scrollHeight - 5;
			recoilFired = false;
			if (timeout) clearTimeout(timeout);
		};

		const handleTouchMove = (e: TouchEvent) => {
			if (isMobileRef.current) return;
			const currentY = e.touches[0].clientY;
			const delta = lastTouchY - currentY;
			lastTouchY = currentY;

			if (!atBottomOnStart) {
				atBottomOnStart =
					window.innerHeight + window.pageYOffset >=
					document.documentElement.scrollHeight - 5;
				return;
			}

			if (delta > 0) {
				liftAmount.set(Math.min(liftAmount.get() + delta * 4, 400));
				recoilFired = false;
			} else if (liftAmount.get() > 0) {
				liftAmount.set(Math.max(0, liftAmount.get() + delta * 4));
			}
		};

		const handleTouchEnd = () => {
			isTouching = false;
			atBottomOnStart = false;
			if (liftAmount.get() > 0) {
				if (timeout) clearTimeout(timeout);
				timeout = setTimeout(() => {
					triggerRebound();
				}, 1500);
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
			{showFooter && !isMobile && <AnimatedFooterImage />}
			<motion.div style={{ y }} className="relative z-10 bg-black">
				{children}
			</motion.div>
		</div>
	);
}
