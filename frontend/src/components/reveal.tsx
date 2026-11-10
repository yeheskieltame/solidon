"use client";

import { motion, useReducedMotion, type HTMLMotionProps } from "motion/react";

const EASE = [0.22, 1, 0.36, 1] as const;

/**
 * Fades and lifts its content in once it scrolls into view. Children marked with
 * `RevealItem` follow one after another (a short stagger). Under prefers-reduced-motion
 * everything is shown at once.
 */
export function Reveal({
  children,
  stagger = 0.07,
  delay = 0,
  className,
  ...rest
}: HTMLMotionProps<"div"> & { stagger?: number; delay?: number }) {
  const reduce = useReducedMotion();
  if (reduce) return <div className={className as string}>{children as React.ReactNode}</div>;
  return (
    <motion.div
      className={className}
      initial="hidden"
      whileInView="shown"
      viewport={{ once: true, margin: "0px 0px -12% 0px" }}
      variants={{
        hidden: {},
        shown: { transition: { staggerChildren: stagger, delayChildren: delay } },
      }}
      {...rest}
    >
      {children}
    </motion.div>
  );
}

export function RevealItem({ children, className, ...rest }: HTMLMotionProps<"div">) {
  const reduce = useReducedMotion();
  if (reduce) return <div className={className as string}>{children as React.ReactNode}</div>;
  return (
    <motion.div
      className={className}
      variants={{
        hidden: { opacity: 0, y: 18 },
        shown: { opacity: 1, y: 0, transition: { duration: 0.6, ease: EASE } },
      }}
      {...rest}
    >
      {children}
    </motion.div>
  );
}
