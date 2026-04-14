"use client";

import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Matter from "matter-js";
import { useEffect, useRef, useState } from "react";

gsap.registerPlugin(ScrollTrigger);

const IMAGE_SOURCES = [
  "/images/issues/Slack.svg",
  "/images/issues/Frame%202147243001.svg",
  "/images/issues/Frame%202147242729.svg",
  "/images/issues/Slack-1.svg",
  "/images/issues/Frame%202147243134.svg",
  "/images/issues/Slack-2.svg",
  "/images/issues/Frame%202147243146.svg",
  "/images/issues/Stripe.svg",
];

const CATEGORY_DEFAULT = 0x0001;
const CATEGORY_CEILING = 0x0002;

export default function ProblemAnimation() {
  const containerRef = useRef(null);
  const engineRef = useRef(Matter.Engine.create());
  const runnerRef = useRef(null);

  const itemsMap = useRef(new Map());
  const grabbedBodies = useRef(new Set());
  const [loadedImages, setLoadedImages] = useState({});

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const { width, height } = container.getBoundingClientRect();
    const engine = engineRef.current;
    engine.gravity.y = 1.2;

    const wallThickness = 100;

    const ground = Matter.Bodies.rectangle(
      width / 2,
      height + wallThickness / 2,
      width,
      wallThickness,
      { isStatic: true },
    );

    const leftWall = Matter.Bodies.rectangle(
      -wallThickness / 2,
      height / 2,
      wallThickness,
      height * 2,
      { isStatic: true },
    );

    const rightWall = Matter.Bodies.rectangle(
      width + wallThickness / 2,
      height / 2,
      wallThickness,
      height * 2,
      { isStatic: true },
    );

    // Ceiling — only collides with bodies that have been grabbed
    const ceiling = Matter.Bodies.rectangle(
      width / 2,
      -wallThickness / 2,
      width,
      wallThickness,
      {
        isStatic: true,
        collisionFilter: {
          category: CATEGORY_CEILING,
          mask: CATEGORY_CEILING,
        },
      },
    );

    Matter.World.add(engine.world, [ground, leftWall, rightWall, ceiling]);

    const isMobile = window.innerWidth < 768;

    // Mouse Interaction (Desktop Only)
    if (!isMobile) {
      const mouse = Matter.Mouse.create(container);
      const mouseConstraint = Matter.MouseConstraint.create(engine, {
        mouse: mouse,
        constraint: { stiffness: 0.15, render: { visible: false } },
      });
      Matter.World.add(engine.world, mouseConstraint);
      mouse.element.removeEventListener("mousewheel", mouse.mousewheel);

      // On grab: mark body as grabbed + enable ceiling collision
      Matter.Events.on(mouseConstraint, "startdrag", (event) => {
        grabbedBodies.current.add(event.body.id);

        Matter.Body.set(event.body, {
          collisionFilter: {
            category: CATEGORY_DEFAULT,
            mask: CATEGORY_DEFAULT | CATEGORY_CEILING,
          },
        });
      });
    }

    // Sync Loop
    const update = () => {
      itemsMap.current.forEach(({ body, element, w, h }) => {
        // Freeze rotation until the user grabs the body
        if (!grabbedBodies.current.has(body.id)) {
          Matter.Body.setAngle(body, 0);
          Matter.Body.setAngularVelocity(body, 0);
        }

        if (element) {
          gsap.set(element, {
            x: body.position.x - w / 2,
            y: body.position.y - h / 2,
            rotation: body.angle * (180 / Math.PI),
            opacity: 1,
          });
        }
      });
    };

    // Trigger Engine on Scroll
    const st = ScrollTrigger.create({
      trigger: container,
      start: "top 85%",
      onEnter: () => {
        runnerRef.current = Matter.Runner.create();
        Matter.Runner.run(runnerRef.current, engine);
        gsap.ticker.add(update);
      },
    });

    return () => {
      st.kill();
      gsap.ticker.remove(update);
      if (runnerRef.current) Matter.Runner.stop(runnerRef.current);
      Matter.World.clear(engine.world);
      Matter.Engine.clear(engine);
    };
  }, []);

  const handleImageLoad = (index, event) => {
    const img = event.target;
    const isMobile = window.innerWidth < 768;
    const scale = isMobile ? 0.6 : 1;

    const w = img.naturalWidth * scale;
    const h = img.naturalHeight * scale;

    const container = containerRef.current;
    const spawnX =
      container.offsetWidth / 2 +
      (Math.random() - 0.5) * (container.offsetWidth * 0.4);
    const spawnY = -100 - index * 50;

    const body = Matter.Bodies.rectangle(spawnX, spawnY, w, h, {
      chamfer: { radius: h / 4 },
      restitution: 0.4,
      friction: 0.1,
      angle: 0,
      // Spawns ignoring the ceiling — falls in freely from above
      collisionFilter: {
        category: CATEGORY_DEFAULT,
        mask: CATEGORY_DEFAULT,
      },
    });

    Matter.World.add(engineRef.current.world, body);

    itemsMap.current.set(index, {
      body,
      element: img.parentElement,
      w,
      h,
    });

    setLoadedImages((prev) => ({ ...prev, [index]: true }));
  };

  return (
    <div
      ref={containerRef}
      className="relative w-full h-[450px] lg:h-full bg-[#080808] overflow-hidden touch-none"
    >
      {IMAGE_SOURCES.map((src, i) => (
        <div
          key={i}
          className="absolute top-0 left-0 opacity-0 will-change-transform"
          style={{ visibility: loadedImages[i] ? "visible" : "hidden" }}
        >
          <img
            src={src}
            alt=""
            loading="lazy"
            onLoad={(e) => handleImageLoad(i, e)}
            className="block cursor-grab active:cursor-grabbing"
            style={{ width: "auto", height: "auto" }}
            draggable={false}
          />
        </div>
      ))}
    </div>
  );
}
