import { motion } from "motion/react";
import { forwardRef } from "react";

export const CyberGlitchIcon = forwardRef(({ paths, className }, ref) => (
  <svg
    viewBox="0 0 14 14"
    className={className}
    ref={ref}
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    {paths.map((d, i) => (
      <path
        key={i}
        d={d}
        fill="currentColor"
        className="icon-pixel-path" // GSAP targets this
      />
    ))}
  </svg>
));
CyberGlitchIcon.displayName = "CyberGlitchIcon";

export const MenuGridIcon = ({ isOpen }) => {
  const gridSquares = [
    { is: "M0 0H3V3H0V0Z", ts: "M0 0H3V3H0V0Z" },
    { is: "M6 0H9V3H6V0Z", ts: "M3 3H6V6H3V3Z" },
    { is: "M12 0H15V3H12V0Z", ts: "M12 0H15V3H12V0Z" },
    { is: "M0 6H3V9H0V6Z", ts: "M3 9H6V12H3V9Z" },
    { is: "M6 6H9V9H6V6Z", ts: "M6 6H9V9H6V6Z" },
    { is: "M12 6H15V9H12V6Z", ts: "M9 3H12V6H9V3Z" },
    { is: "M0 12H3V15H0V12Z", ts: "M0 12H3V15H0V12Z" },
    { is: "M6 12H9V15H6V12Z", ts: "M9 9H12V12H9V9Z" },
    { is: "M12 12H15V15H12V12Z", ts: "M12 12H15V15H12V12Z" },
  ];

  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 15 15"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {gridSquares.map((sq, i) => (
        <motion.path
          key={i}
          d={isOpen ? sq.ts : sq.is}
          initial={{ d: isOpen ? sq.ts : sq.is }}
          animate={{ d: isOpen ? sq.ts : sq.is }}
          transition={{ type: "spring", stiffness: 220, damping: 20 }}
          fill="currentColor"
        />
      ))}
    </svg>
  );
};

export const CTALines = () => {
  const lines = [
    { bottom: "0%", opacity: 0.25 },
    { bottom: "15%", opacity: 0.18 },
    { bottom: "30%", opacity: 0.12 },
    { bottom: "45%", opacity: 0.08 },
    { bottom: "60%", opacity: 0.05 },
    { bottom: "75%", opacity: 0.02 },
  ];

  return (
    <motion.div
      className="absolute bottom-0 left-0 right-0 h-[40%] pointer-events-none z-0"
      variants={{
        initial: {
          opacity: 0,
          y: 6,
          clipPath: "inset(100% 0% 0% 0%)",
        },
        hover: {
          opacity: 1,
          y: 0,
          clipPath: "inset(0% 0% 0% 0%)",
        },
      }}
      transition={{
        duration: 0.4,
        ease: [0.25, 1, 0.5, 1],
      }}
    >
      {lines.map((line, i) => (
        <div
          key={i}
          className="absolute left-0 right-0 h-px"
          style={{
            bottom: line.bottom,
            background: `linear-gradient(to right, rgba(255,255,255,${line.opacity}), rgba(255,255,255,0))`,
          }}
        />
      ))}
    </motion.div>
  );
};

export const IconCTAStart = () => (
  <svg
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    style={{ overflow: "hidden" }}
  >
    <rect width="24" height="24" fill="white" />
    <path d="M15.776 11.2439H17.2865V12.7544H15.776V11.2439Z" fill="#9564FF" />
    <path d="M11.2445 11.2439H12.755V12.7544H11.2445V11.2439Z" fill="#9564FF" />
    <path
      d="M9.73402 11.2439H11.2445V12.7544H9.73402V11.2439Z"
      fill="#9564FF"
    />
    <path
      d="M8.22353 11.2439H9.73402V12.7544H8.22353V11.2439Z"
      fill="#9564FF"
    />
    <path
      d="M6.71304 11.2439H8.22353V12.7544H6.71304V11.2439Z"
      fill="#9564FF"
    />
    <path d="M14.2655 9.7334H15.776V11.2439H14.2655V9.7334Z" fill="#9564FF" />
    <path d="M14.2655 14.2649H15.776V12.7544H14.2655V14.2649Z" fill="#9564FF" />
    <path d="M12.755 8.22291H14.2655V9.7334H12.755V8.22291Z" fill="#9564FF" />
    <path d="M12.755 15.7754H14.2655V14.2649H12.755V15.7754Z" fill="#9564FF" />
    <motion.g
      variants={{ initial: { scale: 1 }, hover: { scale: 1.2 } }}
      style={{ transformBox: "fill-box", transformOrigin: "50% 50%" }}
      transition={{ type: "spring", stiffness: 300, damping: 20 }}
    >
      <path
        d="M18.7924 3.69226H20.3029V5.20275H18.7924V3.69226Z"
        fill="#9564FF"
      />
      <path
        d="M3.69141 3.69226H5.2019V5.20275H3.69141V3.69226Z"
        fill="#9564FF"
      />
      <path
        d="M18.7924 18.7968H20.3029V20.3073H18.7924V18.7968Z"
        fill="#9564FF"
      />
      <path
        d="M3.69141 18.7968H5.2019V20.3073H3.69141V18.7968Z"
        fill="#9564FF"
      />
    </motion.g>
  </svg>
);

export const IconCTADocs = () => (
  <svg
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    style={{ overflow: "hidden" }}
  >
    <rect width="24" height="24" fill="white" />
    <path
      d="M15.7758 16.5301H17.2863V7.46715H15.7758V16.5301Z"
      fill="#0A0A0A"
    />
    <path
      d="M6.71289 16.5301H8.22338V7.46715H6.71289V16.5301Z"
      fill="#0A0A0A"
    />
    <path
      d="M6.71289 7.46715H8.22338V8.97764H6.71289V7.46715Z"
      fill="#0A0A0A"
    />
    <path
      d="M8.22338 5.95667H9.73387V7.46715H8.22338V5.95667Z"
      fill="#0A0A0A"
    />
    <path
      d="M8.22338 18.0406H9.73387V16.5301H8.22338V18.0406Z"
      fill="#0A0A0A"
    />
    <path
      d="M9.73387 5.95667H11.2444V7.46715H9.73387V5.95667Z"
      fill="#0A0A0A"
    />
    <path
      d="M9.73387 18.0406H11.2444V16.5301H9.73387V18.0406Z"
      fill="#0A0A0A"
    />
    <path
      d="M11.2444 5.95667H12.7548V7.46715H11.2444V5.95667Z"
      fill="#0A0A0A"
    />
    <path
      d="M12.7548 5.95667H15.7758V7.46715H12.7548V5.95667Z"
      fill="#0A0A0A"
    />
    <path
      d="M11.2444 18.0406H12.7548V16.5301H11.2444V18.0406Z"
      fill="#0A0A0A"
    />
    <path
      d="M9.73387 8.97764H11.2444V10.4881H9.73387V8.97764Z"
      fill="#0A0A0A"
    />
    <path
      d="M9.73387 11.9986H11.2444V13.5091H9.73387V11.9986Z"
      fill="#0A0A0A"
    />
    <path
      d="M11.2444 8.97764H12.7548V10.4881H11.2444V8.97764Z"
      fill="#0A0A0A"
    />
    <path
      d="M11.2444 11.9986H12.7548V13.5091H11.2444V11.9986Z"
      fill="#0A0A0A"
    />
    <path
      d="M12.7548 8.97764H14.2653V10.4881H12.7548V8.97764Z"
      fill="#0A0A0A"
    />
    <path
      d="M12.7548 11.9986H14.2653V13.5091H12.7548V11.9986Z"
      fill="#0A0A0A"
    />
    <path
      d="M12.7548 18.0406H15.7758V16.5301H12.7548V18.0406Z"
      fill="#0A0A0A"
    />
    <motion.g
      variants={{ initial: { scale: 1 }, hover: { scale: 1.2 } }}
      style={{ transformBox: "fill-box", transformOrigin: "50% 50%" }}
      transition={{ type: "spring", stiffness: 300, damping: 20 }}
    >
      <rect
        x="3.69141"
        y="3.69226"
        width="1.51049"
        height="1.51049"
        fill="#0A0A0A"
      />
      <rect
        x="3.69141"
        y="18.7969"
        width="1.51049"
        height="1.51049"
        fill="#0A0A0A"
      />
      <rect
        x="18.793"
        y="3.69226"
        width="1.51049"
        height="1.51049"
        fill="#0A0A0A"
      />
      <rect
        x="18.793"
        y="18.7969"
        width="1.51049"
        height="1.51049"
        fill="#0A0A0A"
      />
    </motion.g>
  </svg>
);

export const IconDiscord = forwardRef((props, ref) => (
  <CyberGlitchIcon
    ref={ref}
    {...props}
    paths={[
      "M0 0H2.80009V2.80009H0V0Z",
      "M0 11.1999H2.80009V14H0V11.1999Z",
      "M2.79941 2.80055H5.5995V5.60064H2.79941V2.80055Z",
      "M8.4005 2.80055H11.2006V5.60064H8.4005V2.80055Z",
      "M5.59995 0H8.40005V2.80009H5.59995V0Z",
      "M11.1999 0H14V2.80009H11.1999V0Z",
      "M0 5.59995H2.80009V8.40005H0V5.59995Z",
      "M2.79941 8.4005H5.5995V11.2006H2.79941V8.4005Z",
      "M8.4005 8.4005H11.2006V11.2006H8.4005V8.4005Z",
      "M5.59995 11.1999H8.40005V14H5.59995V11.1999Z",
      "M11.1999 5.59995H14V8.40005H11.1999V5.59995Z",
      "M11.1999 11.1999H14V14H11.1999V11.1999Z",
    ]}
  />
));
IconDiscord.displayName = "IconDiscord";

// 2. Blog
export const IconBlog = forwardRef((props, ref) => (
  <CyberGlitchIcon
    ref={ref}
    {...props}
    paths={[
      "M0 2.80055H2.80009V5.60064H0V2.80055Z",
      "M0 8.4005H2.80009V11.2006H0V8.4005Z",
      "M2.79941 0H5.5995V2.80009H2.79941V0Z",
      "M2.79941 5.59995H5.5995V8.40005H2.79941V5.59995Z",
      "M2.79941 11.1999H5.5995V14H2.79941V11.1999Z",
      "M5.59995 2.80055H8.40005V5.60064H5.59995V2.80055Z",
      "M5.59995 8.4005H8.40005V11.2006H5.59995V8.4005Z",
      "M8.4005 0H11.2006V2.80009H8.4005V0Z",
      "M11.1999 2.80055H14V5.60064H11.1999V2.80055Z",
      "M8.4005 5.59995H11.2006V8.40005H8.4005V5.59995Z",
      "M8.4005 11.1999H11.2006V14H8.4005V11.1999Z",
      "M11.1999 8.4005H14V11.2006H11.1999V8.4005Z",
    ]}
  />
));
IconBlog.displayName = "IconBlog";

// 3. Docs
export const IconDocs = forwardRef((props, ref) => (
  <CyberGlitchIcon
    ref={ref}
    {...props}
    paths={[
      "M2.3335 0L4.667 2.3335L2.3335 4.667L0 2.3335L2.3335 0Z",
      "M7 0L9.3335 2.3335L7 4.667L4.667 2.3335L7 0Z",
      "M2.3335 4.667L4.667 7L2.3335 9.3335L0 7L2.3335 4.667Z",
      "M11.6665 0L14 2.3335L11.6665 4.667L9.3335 2.3335L11.6665 0Z",
      "M7 4.667L9.3335 7L7 9.3335L4.667 7L7 4.667Z",
      "M2.3335 9.3335L4.667 11.6665L2.3335 14L0 11.6665L2.3335 9.3335Z",
      "M11.6665 4.667L14 7L11.6665 9.3335L9.3335 7L11.6665 4.667Z",
      "M11.6665 9.3335L14 11.6665L11.6665 14L9.333 11.6665L11.6665 9.3335Z",
      "M7 9.3335L9.333 11.6665L7 14L4.667 11.6665L7 9.3335Z",
    ]}
  />
));
IconDocs.displayName = "IconDocs";

// 4. Pricing
export const IconPricing = forwardRef((props, ref) => (
  <CyberGlitchIcon
    ref={ref}
    {...props}
    paths={[
      "M0 0H2.8V2.8H0V0Z",
      "M14 14H11.2V11.2L14 11.2V14Z",
      "M14 8.40023H11.2V5.60023H14V8.40023Z",
      "M0 11.1995H2.8V13.9995H0V11.1995Z",
      "M2.80046 2.80046H5.60046V5.60046H2.80046V2.80046Z",
      "M11.2007 11.1995H8.40068V8.39954H11.2007V11.1995Z",
      "M8.40023 8.40023H5.60023L5.60046 5.60046L8.40023 5.60023V8.40023Z",
      "M11.2007 0H14.0007V2.8H11.2007V0Z",
      "M5.59977 0H8.39977V2.8H5.59977V0Z",
      "M8.40023 14H5.60023V11.2L8.40023 11.2V14Z",
      "M0 5.59977H2.8V8.39977H0V5.59977Z",
    ]}
  />
));
IconPricing.displayName = "IconPricing";

export const IconDashboard = forwardRef(({ className }, ref) => (
  <svg
    ref={ref}
    width="14"
    height="14"
    viewBox="0 0 14 14"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
  >
    <path
      className="icon-pixel-path"
      d="M0 2.80055H2.80009V5.60064H0V2.80055Z"
      fill="currentColor"
    />
    <path
      className="icon-pixel-path"
      d="M0 8.4005H2.80009V11.2006H0V8.4005Z"
      fill="currentColor"
    />
    <path
      className="icon-pixel-path"
      d="M2.80055 0H5.60064V2.80009H2.80055V0Z"
      fill="currentColor"
    />
    <path
      className="icon-pixel-path"
      d="M2.80055 11.1999H5.60064V14H2.80055V11.1999Z"
      fill="currentColor"
    />
    <path
      className="icon-pixel-path"
      d="M5.59995 5.59995H8.40005V8.40005H5.59995V5.59995Z"
      fill="currentColor"
    />
    <path
      className="icon-pixel-path"
      d="M8.4005 0H11.2006V2.80009H8.4005V0Z"
      fill="currentColor"
    />
    <path
      className="icon-pixel-path"
      d="M11.1999 2.80055H14V5.60064H11.1999V2.80055Z"
      fill="currentColor"
    />
    <path
      className="icon-pixel-path"
      d="M8.4005 11.1999H11.2006V14H8.4005V11.1999Z"
      fill="currentColor"
    />
    <path
      className="icon-pixel-path"
      d="M11.1999 8.4005H14V11.2006H11.1999V8.4005Z"
      fill="currentColor"
    />
  </svg>
));
IconDashboard.displayName = "IconDashboard";

export const IconWebhooks = (props) => (
  <svg
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    {...props}
  >
    <path d="M0 0H4.8V4.8H0V0Z" fill="currentColor" />
    <path d="M24 24H19.2V19.2H24V24Z" fill="currentColor" />
    <path d="M4.8 4.8H9.6V9.6H4.8V4.8Z" fill="currentColor" />
    <path d="M9.6 9.6H14.4V14.4H9.6V9.6Z" fill="currentColor" />
    <path d="M19.2 19.2H14.4V14.4H19.2V19.2Z" fill="currentColor" />
    <path d="M9.6 0H14.4V4.8H9.6V0Z" fill="currentColor" />
    <path d="M14.4 24H9.6V19.2H14.4V24Z" fill="currentColor" />
    <path d="M14.4 4.8H19.2V9.6H14.4V4.8Z" fill="currentColor" />
    <path d="M9.6 19.2H4.8L4.8 14.4H9.6V19.2Z" fill="currentColor" />
    <path d="M19.2 0H24V4.8H19.2V0Z" fill="currentColor" />
    <path d="M4.8 24H0L4.19619e-07 19.2H4.8V24Z" fill="currentColor" />
  </svg>
);

// Usage Analytics: analytics.svg
export const IconAnalytics = (props) => (
  <svg
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    {...props}
  >
    <path d="M0 0H4.8V4.8H0V0Z" fill="currentColor" />
    <path d="M0 19.2H4.8V24H0V19.2Z" fill="currentColor" />
    <path d="M0 14.4H4.8V19.2H0V14.4Z" fill="currentColor" />
    <path d="M4.8 0H9.6V4.8H4.8V0Z" fill="currentColor" />
    <path d="M14.4 19.2H19.2V24H14.4V19.2Z" fill="currentColor" />
    <path d="M9.6 9.6H14.4V14.4H9.6V9.6Z" fill="currentColor" />
    <path d="M19.2 4.8H24V9.6H19.2V4.8Z" fill="currentColor" />
    <path d="M19.2 0H24V4.8H19.2V0Z" fill="currentColor" />
    <path d="M19.2 19.2H24V24H19.2V19.2Z" fill="currentColor" />
  </svg>
);

// Team Billing: billing.svg
export const IconTeam = (props) => (
  <svg
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    {...props}
  >
    <path d="M9.6 0H14.4V4.8H9.6V0Z" fill="currentColor" />
    <path d="M24 9.6V14.4H19.2V9.6H24Z" fill="currentColor" />
    <path d="M9.6 19.2H14.4V24H9.6V19.2Z" fill="currentColor" />
    <path d="M0 9.6H4.8V14.4H0V9.6Z" fill="currentColor" />
    <path d="M4.8 4.8H9.6V9.6H4.8V4.8Z" fill="currentColor" />
    <path d="M14.4 4.8H19.2V9.6H14.4V4.8Z" fill="currentColor" />
    <path d="M9.6 9.6H14.4V14.4H9.6V9.6Z" fill="currentColor" />
    <path d="M4.8 14.4H9.6V19.2H4.8V14.4Z" fill="currentColor" />
    <path d="M14.4 14.4H19.2V19.2H14.4V14.4Z" fill="currentColor" />
  </svg>
);

// Auto Top-ups: top-ups.svg
export const IconTopUp = (props) => (
  <svg
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    {...props}
  >
    <path d="M9.6 4.8H14.4V19.2H9.6V4.8Z" fill="currentColor" />
    <path d="M0 4.8H4.8V9.6H0V4.8Z" fill="currentColor" />
    <path d="M0 0H4.8V4.8H0V0Z" fill="currentColor" />
    <path d="M4.8 0H9.6V4.8H4.8V0Z" fill="currentColor" />
    <path d="M14.4 0H19.2V4.8H14.4V0Z" fill="currentColor" />
    <path d="M19.2 0H24V4.8H19.2V0Z" fill="currentColor" />
    <path d="M19.2 4.8H24V9.6H19.2V4.8Z" fill="currentColor" />
    <path d="M19.2 19.2H24V24H19.2V19.2Z" fill="currentColor" />
    <path d="M19.2 14.4H24V19.2H19.2V14.4Z" fill="currentColor" />
    <path d="M14.4 19.2H19.2V24H14.4V19.2Z" fill="currentColor" />
    <path d="M4.8 19.2H9.6V24H4.8V19.2Z" fill="currentColor" />
    <path d="M0 19.2H4.8V24H0V19.2Z" fill="currentColor" />
    <path d="M0 14.4H4.8V19.2H0V14.4Z" fill="currentColor" />
  </svg>
);

// Custom Plans: custom-plans.svg
export const IconPlans = (props) => (
  <svg
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    {...props}
  >
    <path d="M0 0H4.8V4.8H0V0Z" fill="currentColor" />
    <path d="M0 9.6H4.8V14.4H0V9.6Z" fill="currentColor" />
    <path d="M0 19.2H4.8V24H0V19.2Z" fill="currentColor" />
    <path d="M9.6 0H14.4V4.8H9.6V0Z" fill="currentColor" />
    <path d="M9.6 9.6H14.4V14.4H9.6V9.6Z" fill="currentColor" />
    <path d="M9.6 19.2H14.4V24H9.6V19.2Z" fill="currentColor" />
    <path d="M19.2 0H24V4.8H19.2V0Z" fill="currentColor" />
    <path d="M19.2 9.6H24V14.4H19.2V9.6Z" fill="currentColor" />
    <path d="M19.2 19.2H24V24H19.2V19.2Z" fill="currentColor" />
  </svg>
);

// Pricing Versioning: pricing.svg
export const IconVersioning = (props) => (
  <svg
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    {...props}
  >
    <path
      d="M24 0L24 4.7874L19.2 4.7874L19.2 -2.09815e-07L24 0Z"
      fill="currentColor"
    />
    <path
      d="M-1.04632e-06 23.937L-8.37056e-07 19.1496L4.8 19.1496L4.8 23.937L-1.04632e-06 23.937Z"
      fill="currentColor"
    />
    <path
      d="M19.2 4.7874L19.2 9.5748L14.4 9.5748L14.4 4.7874L19.2 4.7874Z"
      fill="currentColor"
    />
    <path
      d="M4.8 19.1496L4.8 14.3622L9.6 14.3622L9.6 19.1496L4.8 19.1496Z"
      fill="currentColor"
    />
    <path
      d="M24 9.5748L24 14.3622L19.2 14.3622L19.2 9.5748L24 9.5748Z"
      fill="currentColor"
    />
    <path
      d="M-6.27792e-07 14.3622L-4.18528e-07 9.5748L4.8 9.5748L4.8 14.3622L-6.27792e-07 14.3622Z"
      fill="currentColor"
    />
    <path
      d="M19.2 14.3622L19.2 19.1496L14.4 19.1496L14.4 14.3622L19.2 14.3622Z"
      fill="currentColor"
    />
    <path
      d="M4.8 9.5748L4.8 4.7874L9.6 4.7874L9.6 9.5748L4.8 9.5748Z"
      fill="currentColor"
    />
    <path
      d="M24 19.1496L24 23.937L19.2 23.937L19.2 19.1496L24 19.1496Z"
      fill="currentColor"
    />
    <path
      d="M-2.09264e-07 4.7874L0 -1.04907e-06L4.8 -4.20741e-07L4.8 4.7874L-2.09264e-07 4.7874Z"
      fill="currentColor"
    />
    <path
      d="M14.4 -4.19629e-07L14.4 4.7874L9.6 4.7874L9.6 -6.29444e-07L14.4 -4.19629e-07Z"
      fill="currentColor"
    />
    <path
      d="M14.4 19.2126L14.4 24L9.6 24L9.6 19.2126L14.4 19.2126Z"
      fill="currentColor"
    />
  </svg>
);

// React Components: react-components.svg
export const IconReact = (props) => (
  <svg
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    {...props}
  >
    <path
      d="M0 24L-2.09815e-07 19.2L4.8 19.2L4.8 24L0 24Z"
      fill="currentColor"
    />
    <path
      d="M-4.19629e-07 14.4L-1.04907e-06 1.90735e-06L4.8 1.69753e-06L4.8 14.4L-4.19629e-07 14.4Z"
      fill="currentColor"
    />
    <path
      d="M4.8 19.2L4.8 14.4L9.6 14.4L9.6 19.2L4.8 19.2Z"
      fill="currentColor"
    />
    <path d="M9.6 24L9.6 19.2L14.4 19.2L14.4 24L9.6 24Z" fill="currentColor" />
    <path
      d="M9.6 14.4L9.6 1.48772e-06L14.4 1.2779e-06L14.4 14.4L9.6 14.4Z"
      fill="currentColor"
    />
    <path
      d="M14.4 19.2L14.4 14.4L19.2 14.4L19.2 19.2L14.4 19.2Z"
      fill="currentColor"
    />
    <path d="M19.2 24L19.2 19.2L24 19.2L24 24L19.2 24Z" fill="currentColor" />
    <path
      d="M19.2 14.4L19.2 1.06809e-06L24 8.58275e-07L24 14.4L19.2 14.4Z"
      fill="currentColor"
    />
  </svg>
);

// Referral Programs: referral.svg
export const IconReferral = (props) => (
  <svg
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    {...props}
  >
    <path d="M0 9.6H4.8V14.4H0V9.6Z" fill="currentColor" />
    <path d="M19.2 9.6H24V14.4H19.2V9.6Z" fill="currentColor" />
    <path d="M4.8 14.4H9.6V19.2H4.8V14.4Z" fill="currentColor" />
    <path d="M0 0H4.8V4.8H0V0Z" fill="currentColor" />
    <path d="M0 19.2H4.8V24H0V19.2Z" fill="currentColor" />
    <path d="M9.6 9.6H14.4V14.4H9.6V9.6Z" fill="currentColor" />
    <path d="M9.6 4.8H14.4V9.6H9.6V4.8Z" fill="currentColor" />
    <path d="M14.4 14.4H19.2V19.2H14.4V14.4Z" fill="currentColor" />
    <path d="M9.6 14.4H14.4V19.2H9.6V14.4Z" fill="currentColor" />
    <path d="M9.6 19.2H14.4V24H9.6V19.2Z" fill="currentColor" />
    <path d="M9.6 0H14.4V4.8H9.6V0Z" fill="currentColor" />
    <path d="M19.2 0H24V4.8H19.2V0Z" fill="currentColor" />
    <path d="M14.4 4.8H19.2V9.6H14.4V4.8Z" fill="currentColor" />
    <path d="M4.8 4.8H9.6V9.6H4.8V4.8Z" fill="currentColor" />
    <path d="M19.2 19.2H24V24H19.2V19.2Z" fill="currentColor" />
  </svg>
);

export const IconArrowLeft = ({ className, disabled, ...props }) => (
  <svg
    width="26"
    height="26"
    viewBox="0 0 26 26"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={`${disabled ? "opacity-20" : "opacity-100"} ${className || ""}`}
    {...props}
  >
    <g>
      <path
        d="M8.90447 12.1809H7.26811V13.8173H8.90447V12.1809Z"
        fill="currentColor"
      />
      <path
        d="M13.8136 12.1809H12.1772V13.8173H13.8136V12.1809Z"
        fill="currentColor"
      />
      <path
        d="M15.4499 12.1809H13.8136V13.8173H15.4499V12.1809Z"
        fill="currentColor"
      />
      <path
        d="M17.0863 12.1809H15.4499V13.8173H17.0863V12.1809Z"
        fill="currentColor"
      />
      <path
        d="M18.7227 12.1809H17.0863V13.8173H18.7227V12.1809Z"
        fill="currentColor"
      />
      <path
        d="M10.5408 10.5446H8.90447V12.1809H10.5408V10.5446Z"
        fill="currentColor"
      />
      <path
        d="M10.5408 15.4537H8.90447V13.8173H10.5408V15.4537Z"
        fill="currentColor"
      />
      <path
        d="M12.1772 8.9082H10.5408V10.5446H12.1772V8.9082Z"
        fill="currentColor"
      />
      <path
        d="M12.1772 17.09H10.5408V15.4537H12.1772V17.09Z"
        fill="currentColor"
      />
      <g className="arrow-corners">
        <path d="M5.63672 4H4.00035V5.63636H5.63672V4Z" fill="currentColor" />
        <path d="M21.9961 4H20.3597V5.63636H21.9961V4Z" fill="currentColor" />
        <path
          d="M5.63672 20.3633H4.00035V21.9996H5.63672V20.3633Z"
          fill="currentColor"
        />
        <path
          d="M21.9961 20.3633H20.3597V21.9996H21.9961V20.3633Z"
          fill="currentColor"
        />
      </g>
    </g>
  </svg>
);

export const IconArrowRight = ({ className, disabled, ...props }) => (
  <svg
    width="26"
    height="26"
    viewBox="0 0 26 26"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={`${disabled ? "opacity-20" : "opacity-100"} ${className || ""}`}
    {...props}
  >
    <path
      d="M17.0916 12.1809H18.728V13.8173H17.0916V12.1809Z"
      fill="currentColor"
    />
    <path
      d="M12.1825 12.1809H13.8189V13.8173H12.1825V12.1809Z"
      fill="currentColor"
    />
    <path
      d="M10.5462 12.1809H12.1825V13.8173H10.5462V12.1809Z"
      fill="currentColor"
    />
    <path
      d="M8.9098 12.1809H10.5462V13.8173H8.9098V12.1809Z"
      fill="currentColor"
    />
    <path
      d="M7.27344 12.1809H8.9098V13.8173H7.27344V12.1809Z"
      fill="currentColor"
    />
    <path
      d="M15.4553 10.5446H17.0916V12.1809H15.4553V10.5446Z"
      fill="currentColor"
    />
    <path
      d="M15.4553 15.4537H17.0916V13.8173H15.4553V15.4537Z"
      fill="currentColor"
    />
    <path
      d="M13.8189 8.9082H15.4553V10.5446H13.8189V8.9082Z"
      fill="currentColor"
    />
    <path
      d="M13.8189 17.09H15.4553V15.4537H13.8189V17.09Z"
      fill="currentColor"
    />
    <g className="arrow-corners">
      <path d="M20.3594 4H21.9957V5.63636H20.3594V4Z" fill="currentColor" />
      <path d="M4 4H5.63636V5.63636H4V4Z" fill="currentColor" />
      <path
        d="M20.3594 20.3633H21.9957V21.9996H20.3594V20.3633Z"
        fill="currentColor"
      />
      <path d="M4 20.3633H5.63636V21.9996H4V20.3633Z" fill="currentColor" />
    </g>
  </svg>
);

export const IconQuotes = ({ className, ...props }) => (
  <svg
    width="27"
    height="24"
    viewBox="0 0 27 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    {...props}
  >
    <rect y="13.0908" width="10.9091" height="10.9091" fill="currentColor" />
    <rect y="8.72729" width="4.36364" height="4.36364" fill="currentColor" />
    <rect
      x="2.18359"
      y="4.36353"
      width="4.36364"
      height="4.36364"
      fill="currentColor"
    />
    <rect x="6.54688" width="4.36364" height="4.36364" fill="currentColor" />
    <rect
      x="15.2734"
      y="13.0908"
      width="10.9091"
      height="10.9091"
      fill="currentColor"
    />
    <rect
      x="15.2734"
      y="8.72729"
      width="4.36364"
      height="4.36364"
      fill="currentColor"
    />
    <rect
      x="17.4551"
      y="4.36353"
      width="4.36364"
      height="4.36364"
      fill="currentColor"
    />
    <rect x="21.8184" width="4.36364" height="4.36364" fill="currentColor" />
  </svg>
);

export const IconTick = ({ className, ...props }) => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 16 16"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    {...props}
  >
    <rect
      x="0.4"
      y="0.4"
      width="15.2"
      height="15.2"
      stroke="#8752FA"
      strokeWidth="0.8"
    />
    <path
      d="M12.0801 4.71997V5.94653H11.0801V7.01294H10.0801V8.08032H9.08008V9.14673H8.08008V10.2131H7.08008V11.2805H5.91992V10.2131H4.91992V9.14673H3.91992V7.92017H5.08008V8.98657H6.08008V10.053H6.91992V8.98657H7.91992V7.92017H8.91992V6.85376H9.91992V5.78638H10.9199V4.71997H12.0801Z"
      fill="#9564FF"
      stroke="#9564FF"
      strokeWidth="0.16"
    />
  </svg>
);

export const IconArrowRightSmall = ({ className, ...props }) => (
  <motion.svg
    width="18"
    height="18"
    viewBox="0 0 18 18"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    overflow="visible"
    {...props}
  >
    <path
      d="M13.0916 8.18093H14.728V9.81729H13.0916V8.18093Z"
      fill="currentColor"
    />
    <path
      d="M8.18253 8.18093H9.81889V9.81729H8.18253V8.18093Z"
      fill="currentColor"
    />
    <path
      d="M6.54616 8.18093H8.18253V9.81729H6.54616V8.18093Z"
      fill="currentColor"
    />
    <path
      d="M4.9098 8.18093H6.54616V9.81729H4.9098V8.18093Z"
      fill="currentColor"
    />
    <path
      d="M3.27344 8.18093H4.9098V9.81729H3.27344V8.18093Z"
      fill="currentColor"
    />
    <path
      d="M11.4553 6.54457H13.0916V8.18093H11.4553V6.54457Z"
      fill="currentColor"
    />
    <path
      d="M11.4553 11.4537H13.0916V9.81729H11.4553V11.4537Z"
      fill="currentColor"
    />
    <path
      d="M9.81889 4.9082H11.4553V6.54457H9.81889V4.9082Z"
      fill="currentColor"
    />
    <path
      d="M9.81889 13.09H11.4553V11.4537H9.81889V13.09Z"
      fill="currentColor"
    />
    <motion.g
      variants={{ initial: { scale: 1 }, hover: { scale: 1.2 } }}
      style={{ transformBox: "fill-box", transformOrigin: "50% 50%" }}
      transition={{ type: "spring", stiffness: 300, damping: 20 }}
    >
      <path d="M16.3594 0H17.9957V1.63636H16.3594V0Z" fill="currentColor" />
      <path d="M0 0H1.63636V1.63636H0V0Z" fill="currentColor" />
      <path
        d="M16.3594 16.3633H17.9957V17.9996H16.3594V16.3633Z"
        fill="currentColor"
      />
      <path d="M0 16.3633H1.63636V17.9996H0V16.3633Z" fill="currentColor" />
    </motion.g>
  </motion.svg>
);

export const AnimatedPlusMinus = ({ isOpen, className, ...props }) => {
  // Fragments that form the vertical line of the "Plus"
  const vPixels = [
    { y: 3, originY: "center", xBurst: -8, delay: 0 },
    { y: 5, originY: "center", xBurst: -4, delay: 0.05 },
    { y: 9, originY: "center", xBurst: 4, delay: 0.05 },
    { y: 11, originY: "center", xBurst: 8, delay: 0 },
  ];

  return (
    <motion.svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      {...props}
    >
      {/* Corner decorative pixels - stay static but fade slightly */}
      {[
        [0, 0],
        [14, 0],
        [0, 14],
        [14, 14],
      ].map(([x, y], i) => (
        <rect key={i} x={x} y={y} width="2" height="2" fill="currentColor" />
      ))}

      {/* Horizontal Bar - The "Minus" part (Static) */}
      <rect x="3" y="7" width="2" height="2" fill="currentColor" />
      <rect x="5" y="7" width="2" height="2" fill="currentColor" />
      <rect x="7" y="7" width="2" height="2" fill="currentColor" />
      <rect x="9" y="7" width="2" height="2" fill="currentColor" />
      <rect x="11" y="7" width="2" height="2" fill="currentColor" />

      {/* Vertical Bursting Pixels */}
      {vPixels.map((pixel, i) => (
        <motion.rect
          key={i}
          x="7"
          y={pixel.y}
          width="2"
          height="2"
          fill="currentColor"
          initial={false}
          animate={{
            x: isOpen ? pixel.xBurst : 0,
            opacity: isOpen ? 0 : 1,
            scale: isOpen ? 0.5 : 1,
          }}
          transition={{
            duration: 0.4,
            ease: [0.16, 1, 0.3, 1], // Custom sleek tech ease
            delay: isOpen ? pixel.delay : 0,
          }}
        />
      ))}
    </motion.svg>
  );
};

export const IconPlus = ({ className, ...props }) => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 16 16"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    {...props}
  >
    <g opacity="0.4">
      <rect
        x="16"
        y="16"
        width="2"
        height="2"
        transform="rotate(-180 16 16)"
        fill="currentColor"
      />
      <rect
        x="7"
        y="9.08008"
        width="2"
        height="2"
        transform="rotate(-180 7 9.08008)"
        fill="currentColor"
      />
      <rect
        x="9"
        y="7"
        width="2"
        height="2"
        transform="rotate(-180 9 7)"
        fill="currentColor"
      />
      <rect
        x="9"
        y="13.0469"
        width="2"
        height="2"
        transform="rotate(-180 9 13.0469)"
        fill="currentColor"
      />
      <rect
        x="9"
        y="5.02832"
        width="2"
        height="2"
        transform="rotate(-180 9 5.02832)"
        fill="currentColor"
      />
      <rect
        x="9"
        y="11.0752"
        width="2"
        height="2"
        transform="rotate(-180 9 11.0752)"
        fill="currentColor"
      />
      <rect
        width="2"
        height="2"
        transform="matrix(1 8.74228e-08 8.74228e-08 -1 9 9.08008)"
        fill="currentColor"
      />
      <rect
        x="5"
        y="9.08008"
        width="2"
        height="2"
        transform="rotate(-180 5 9.08008)"
        fill="currentColor"
      />
      <rect
        width="2"
        height="2"
        transform="matrix(1 8.74228e-08 8.74228e-08 -1 11 9.08008)"
        fill="currentColor"
      />
      <rect
        x="16"
        y="2"
        width="2"
        height="2"
        transform="rotate(-180 16 2)"
        fill="currentColor"
      />
      <rect
        x="2"
        y="16"
        width="2"
        height="2"
        transform="rotate(-180 2 16)"
        fill="currentColor"
      />
      <rect
        x="2"
        y="2"
        width="2"
        height="2"
        transform="rotate(-180 2 2)"
        fill="currentColor"
      />
    </g>
  </svg>
);

export const IconMinus = ({ className, ...props }) => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 16 16"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    {...props}
  >
    <rect
      x="16"
      y="16"
      width="2"
      height="2"
      transform="rotate(-180 16 16)"
      fill="currentColor"
    />
    <rect
      x="7"
      y="9.08008"
      width="2"
      height="2"
      transform="rotate(-180 7 9.08008)"
      fill="currentColor"
    />
    <rect
      width="4.43945"
      height="2"
      transform="matrix(1 8.74228e-08 8.74228e-08 -1 6.56055 9.08008)"
      fill="currentColor"
    />
    <rect
      x="5"
      y="9.08008"
      width="2"
      height="2"
      transform="rotate(-180 5 9.08008)"
      fill="currentColor"
    />
    <rect
      width="2"
      height="2"
      transform="matrix(1 8.74228e-08 8.74228e-08 -1 11 9.08008)"
      fill="currentColor"
    />
    <rect
      x="16"
      y="2"
      width="2"
      height="2"
      transform="rotate(-180 16 2)"
      fill="currentColor"
    />
    <rect
      x="2"
      y="16"
      width="2"
      height="2"
      transform="rotate(-180 2 16)"
      fill="currentColor"
    />
    <rect
      x="2"
      y="2"
      width="2"
      height="2"
      transform="rotate(-180 2 2)"
      fill="currentColor"
    />
  </svg>
);

export const faqData = [
  {
    id: 1,
    question: "Do I still need Stripe?",
    answer:
      "Yes. Autumn works with Stripe—it handles the billing logic that Stripe doesn't. You keep your Stripe account, your customer relationships, and your payment data. Autumn sits between your app and Stripe, managing webhooks, usage limits, and state.\n\nYou're never locked in. Your subscriptions live in Stripe.",
  },
  {
    id: 2,
    question: "What if Autumn goes down? Will my app go down?",
    answer:
      "We run on redundant infrastructure and high availability is our priority. However, not being able to reach Autumn does not mean that your app will go down. Our SDKs default to fail open and fail fast, meaning that in a worst case scenario, some users may get temporary additional access.\n\nWe can work with you to reconcile usage tracking and balances afterward if needed.",
  },
  {
    id: 3,
    question: "How is Autumn different from Orb or Metronome?",
    answer:
      "Orb and Metronome focus on usage metering—tracking how much customers consume, suitable for end of month invoicing. You still have to build access control and state management separately, meaning you'll wire together your own logic, Stripe billing and a metering provider.\n\nAutumn is a complete system of record. We handle usage metering + entitlements + feature gating + billing state in one API. `check()` tells you if a user can access a feature in <50ms.",
  },
  {
    id: 4,
    question: "What if I need to move off Autumn? Am I locked in?",
    answer:
      "Autumn is open source. You can self-host anytime, or export all your data. Your Stripe subscriptions, customers and payment details remain yours. Moving off Autumn is simply a case of building what you would have built in-house without Autumn (but this has never happened, touch wood!). ",
  },
  {
    id: 5,
    question: "How long does integration take?",
    answer:
      "Most teams go live in under an hour. Migrating from an existing billing system typically takes 1–2 weeks, depending on complexity. For Series A+ companies, we provide a forward deployed service to work with your team, dual-write to your internal system and Autumn, then smoothly migrate over. Minimal work needed on your part.",
  },
  {
    id: 6,
    question: "Can you handle our event volume?",
    answer:
      "Yes. Autumn supports 10,000+ events per second per end customer. We've processed millions of billing events daily for AI companies at scale. If you have specific requirements, reach out—we'll walk through your architecture.",
  },
  {
    id: 7,
    question: "What if I can't use `check()`?",
    answer:
      "Latency-sensitive customers may not be able to use `check()` in real-time. In these cases, you can cache the Autumn customer data on your end, or use our single `customer.products.updated` webhook to replicate the Autumn state into your own system.",
  },
];

export const featuresData = [
  {
    title: "Usage Ledgers",
    description:
      "Recurring, one-time and rollover credit balances. Stack balances across plans and topups. Deduct from soonest expiry first.",
    Icon: IconWebhooks,
  },
  {
    title: "Payment Logic",
    description:
      "Checkouts, upgrades, downgrades, add-ons, proration, 3DS, edge cases, webhooks: all handled in a single API call.",
    Icon: IconWebhooks,
  },
  {
    title: "Custom Plans",
    description:
      "Create one-off deals for enterprise customers. Unique pricing, features, and limits without touching code.",
    Icon: IconPlans,
  },
  {
    title: "Usage Analytics",
    description:
      "Fast timeseries charts and event logs out of the box. Powered by ClickHouse.",
    Icon: IconAnalytics,
  },
  {
    title: "Team Billing",
    description:
      "Grant plans and features to entities under an organization. Create pools of credits, or assign to users directly.",
    Icon: IconTeam,
  },
  {
    title: "Auto Top-ups",
    description:
      "Let users refill credits when balance runs low. Configure thresholds and amounts. Fully automated.",
    Icon: IconTopUp,
  },
  {
    title: "Pricing Versioning",
    description:
      "Change your pricing model without breaking existing customers. Grandfather old plans or migrate users gradually. No database or Stripe migrations.",
    Icon: IconVersioning,
  },
  {
    title: "Alerts and Spend Limits",
    description:
      "Give customers governance over their usage. Configure alerts, limits and overage per customer.",
    Icon: IconReact,
  },
  {
    title: "Coupons and Referrals",
    description:
      "Built-in referral system with rewards, tracking, and attribution. Launch referral programs in minutes.",
    Icon: IconReferral,
  },
];

export const PixelatedPattern = ({ className, ...props }) => (
  // eslint-disable-next-line @next/next/no-img-element
  <img
    src="/images/pixelated-pattern.svg"
    alt=""
    aria-hidden="true"
    className={className}
    {...props}
  />
);

export const PRELOADER_LOGO_PATH =
  "M0 138.789C12.1644 110.86 24.3298 82.9305 36.4942 55.001L159.78 0V149.976C112.437 178.653 65.0945 207.323 17.7521 236L113.418 65.9915L107.494 73.674C81.1937 107.783 54.8935 141.893 28.601 176.002C19.0674 163.601 9.53363 151.191 0 138.789Z";

export const PRELOADER_LOGO_VIEWBOX = { width: 160, height: 236 };

export const PreloaderLogo = ({ className, ...props }) => (
  <svg
    width="160"
    height="236"
    viewBox="0 0 160 236"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    aria-hidden="true"
    {...props}
  >
    <path d={PRELOADER_LOGO_PATH} fill="white" />
  </svg>
);

export const ProblemBgSvg = (props) => (
  <div
    className="w-full h-auto hidden md:block cursor-pointer transition-all duration-300 hover:brightness-125 hover:drop-shadow-[0_0_15px_rgba(255,255,255,0.15)]"
    {...props}
  >
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img
      src="/images/problems/problembg.svg"
      alt="Problem Background"
      className="w-full h-auto"
    />
  </div>
);
