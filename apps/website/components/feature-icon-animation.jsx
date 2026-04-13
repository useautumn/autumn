"use client";
import { forwardRef, useImperativeHandle, useRef, useEffect } from "react";
import gsap from "gsap";

export const FeatureIconAnimation = forwardRef(({ Icon }, ref) => {
  const iconRef = useRef(null);
  const tlRef = useRef(null);

  useImperativeHandle(ref, () => ({
    play: () => tlRef.current?.play(),
    reverse: () => tlRef.current?.reverse(),
  }));

  useEffect(() => {
    const pixelEls = iconRef.current?.querySelectorAll("path");
    if (!pixelEls?.length) return;

    // Sort pixels by distance from center — center pixels animate first, outer ones last
    const centers = Array.from(pixelEls).map((el) => {
      const b = el.getBBox();
      return { el, cx: b.x + b.width / 2, cy: b.y + b.height / 2 };
    });
    const midX = centers.reduce((s, c) => s + c.cx, 0) / centers.length;
    const midY = centers.reduce((s, c) => s + c.cy, 0) / centers.length;
    const pixels = centers
      .sort((a, b) => {
        const da = (a.cx - midX) ** 2 + (a.cy - midY) ** 2;
        const db = (b.cx - midX) ** 2 + (b.cy - midY) ** 2;
        return da - db;
      })
      .map((c) => c.el);

    gsap.set(pixels, {
      opacity: 0.15,
      scale: 0.8,
      transformOrigin: "center center",
      fill: "currentColor",
    });

    tlRef.current = gsap.timeline({ paused: true });

    tlRef.current
      .to(pixels, {
        opacity: 1,
        scale: 1.15,
        fill: "#9564ff",
        duration: 0.2,
        stagger: 0.04,
        ease: "power2.out",
      })
      .to(pixels, {
        scale: 1,
        duration: 0.15,
        ease: "back.out(3)",
      });

    return () => tlRef.current?.kill();
  }, []);

  return (
    <div className="relative flex items-center justify-start w-12 h-12 group/icon">
      <div className="relative w-[24px] h-[24px] flex items-center justify-center">
        <Icon ref={iconRef} className="w-full h-full text-white" />
      </div>
    </div>
  );
});
FeatureIconAnimation.displayName = "FeatureIconAnimation";
