"use client";

import Image from "next/image";
import { forwardRef } from "react";

const AnimatedFooterImage = forwardRef(function AnimatedFooterImage(_, ref) {
  return (
    <div
      ref={ref}
      className="fixed bottom-0 lg:-bottom-46 left-0 w-full z-0 pointer-events-none"
    >
      {/* Mobile */}
      <Image
        src="/images/footer/footer-mob.webp"
        alt="footer background"
        loading="lazy"
        width={0}
        height={0}
        sizes="100vw"
        className="block xl:hidden w-full h-[600px] md:h-[800px] object-cover object-top translate-y-35"
      />

      {/* Desktop */}
      <Image
        src="/images/footer/footer.webp"
        alt="footer background"
        width={0}
        height={0}
        sizes="100vw"
        loading="lazy"
        className="hidden xl:block w-full h-auto xl:translate-y-16"
      />
    </div>
  );
});

export default AnimatedFooterImage;
