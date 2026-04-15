"use client";
import { forwardRef, useImperativeHandle, useRef, useEffect } from "react";
import gsap from "gsap";

export const DashboardIconPixel = forwardRef(function DashboardIconPixel(
  { Icon },
  ref,
) {
  const iconRef = useRef(null);
  const tlRef = useRef(null);

  useImperativeHandle(ref, () => ({
    restart: () => tlRef.current?.play(),
    reverse: () => tlRef.current?.reverse(),
  }));

  useEffect(() => {
    const pixelEls = iconRef.current?.querySelectorAll(".icon-pixel-path");
    if (!pixelEls?.length) return;

    // Sort pixels by visual position: bottom-left → top-right diagonal
    const pixels = Array.from(pixelEls).sort((a, b) => {
      const aBox = a.getBBox();
      const bBox = b.getBBox();
      return (
        aBox.x +
        aBox.width / 2 -
        (aBox.y + aBox.height / 2) -
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

    tlRef.current
      .to(pixels, {
        opacity: 1,
        scale: 1.15,
        fill: "#FFFFFF",
        duration: 0.2,
        stagger: 0.01,
        ease: "power2.out",
      })
      .to(pixels, {
        scale: 1,
        duration: 0.01,
        ease: "back.out(3)",
      });

    return () => tlRef.current?.kill();
  }, []);

  return (
    <span className="relative inline-flex items-center justify-center w-[14px] h-[14px]">
      <Icon ref={iconRef} className="w-full h-full text-white" />
    </span>
  );
});
