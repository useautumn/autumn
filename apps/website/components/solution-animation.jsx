"use client";

import { useEffect, useRef } from "react";
import lottie, { AnimationItem } from "lottie-web";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import desktopAnimationData from "@/public/animation/solution-desktop.json";
import mobileAnimationData from "@/public/animation/solution-mobile.json";

gsap.registerPlugin(ScrollTrigger);

export default function SolutionAnimation() {
  const containerRef = useRef(null);
  const animRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const isMobile = window.innerWidth < 768;
    const animationData = isMobile ? mobileAnimationData : desktopAnimationData;

    const anim = lottie.loadAnimation({
      container: containerRef.current,
      renderer: "svg",
      loop: false,
      autoplay: false,
      animationData,
    });

    animRef.current = anim;

    const totalFrames = anim.totalFrames;

    const loopStart = Math.floor(totalFrames * 0.2);

    anim.addEventListener("complete", () => {
      anim.loop = true;
      anim.playSegments([loopStart, totalFrames], true);
    });

    const st = ScrollTrigger.create({
      trigger: containerRef.current,
      start: "top 75%", // Plays when the top of the animation reaches 75% viewport height
      onEnter: () => anim.play(),
    });

    return () => {
      st.kill();
      anim.destroy();
    };
  }, []);

  return <div ref={containerRef} style={{ width: "100%" }} />;
}
