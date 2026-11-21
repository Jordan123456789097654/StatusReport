"use client";

// Small animation helpers built on `motion`. All respect the user's reduced-motion setting.
import { motion, useReducedMotion, type HTMLMotionProps } from "motion/react";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

const ease = [0.22, 1, 0.36, 1] as const;

export function FadeUp({ children, delay = 0, y = 14, className, ...rest }: { children: ReactNode; delay?: number; y?: number; className?: string } & Omit<HTMLMotionProps<"div">, "children">) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduce ? false : { opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.55, delay, ease }}
      {...rest}
    >
      {children}
    </motion.div>
  );
}

/** Staggers its direct <StaggerItem> children in. */
export function Stagger({ children, className, gap = 0.06 }: { children: ReactNode; className?: string; gap?: number }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduce ? false : "hidden"}
      animate="show"
      variants={{ hidden: {}, show: { transition: { staggerChildren: gap } } }}
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div className={className} variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0, transition: { duration: 0.4, ease } } }}>
      {children}
    </motion.div>
  );
}

/** Fades dashboard pages in on navigation. */
export function PageTransition({ children }: { children: ReactNode }) {
  const path = usePathname();
  const reduce = useReducedMotion();
  return (
    <motion.div key={path} initial={reduce ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease }}>
      {children}
    </motion.div>
  );
}

/** Lifts slightly on hover; used for clickable cards. */
export function HoverLift({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div className={className} whileHover={{ y: -3 }} transition={{ type: "spring", stiffness: 400, damping: 28 }}>
      {children}
    </motion.div>
  );
}

/** Fades in on mount (not scroll-triggered), safe inside scroll containers and previews. */
export function Reveal({ children, delay = 0, className }: { children: ReactNode; delay?: number; className?: string }) {
  const reduce = useReducedMotion();
  return (
    <motion.div className={className} initial={reduce ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay, ease }}>
      {children}
    </motion.div>
  );
}
