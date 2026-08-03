"use client";

import { DesktopAccordion } from "./desktop-accordion";
import { MobileCarousel } from "./mobile-carousel";
import { StoryHeading } from "./story-heading";

export default function CustomerStories() {
	return (
		<section className="w-full bg-[#0F0F0F] text-white overflow-hidden">
			<StoryHeading />
			<DesktopAccordion />
			<MobileCarousel />
		</section>
	);
}
