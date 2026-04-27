"use client";
import Image from "next/image";
import { forwardRef } from "react";

const AnimatedFooterImage = forwardRef<HTMLDivElement>(
	function AnimatedFooterImage(_props, ref) {
		return (
			<div
				ref={ref}
				className="fixed bottom-0 left-0 w-full z-0 pointer-events-none overflow-hidden h-[420px] md:h-[580px]"
			>
				<div className="relative w-full h-full">
				<Image
					src="/images/footer/footer.avif"
					alt="footer background"
					fill
					sizes="100vw"
					className="object-cover object-top"
				/>
				</div>
			</div>
		);
	},
);

AnimatedFooterImage.displayName = "AnimatedFooterImage";

export default AnimatedFooterImage;
