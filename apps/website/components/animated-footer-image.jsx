"use client";
import Image from "next/image";
import { forwardRef } from "react";

const AnimatedFooterImage = forwardRef(function AnimatedFooterImage(_, ref) {
  return (
    <div
      ref={ref}
      className="fixed bottom-0 left-0 w-full z-0 pointer-events-none overflow-hidden h-[420px] md:h-[580px]"
    >
      <div className="relative w-full h-full">
        <Image
          src="/images/footer/footer.webp"
          alt="footer background"
          fill
          priority
          sizes="100vw"
          className="object-cover object-top"
        />
      </div>
    </div>
  );
});

export default AnimatedFooterImage;
