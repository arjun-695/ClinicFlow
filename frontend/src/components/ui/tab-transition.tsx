"use client";

import React from "react";
import { motion, AnimatePresence, MotionConfig } from "framer-motion";

interface TabTransitionProps {
  activeTab: string;
  direction: number;
  contentBoundsHeight: number | string;
  contentRef: React.Ref<HTMLDivElement>;
  onAnimationStart: () => void;
  onAnimationComplete: (definition: string) => void;
  children: React.ReactNode;
}

export default function TabTransition({
  activeTab,
  direction,
  contentBoundsHeight,
  contentRef,
  onAnimationStart,
  onAnimationComplete,
  children
}: TabTransitionProps) {
  return (
    <MotionConfig transition={{ duration: 0.4, type: "spring", bounce: 0.15 }}>
      <motion.div
        className="relative w-full"
        animate={{ height: contentBoundsHeight || "auto" }}
        transition={{ duration: 0.35, ease: "easeInOut" }}
      >
        <div ref={contentRef}>
          <AnimatePresence initial={false} custom={direction} mode="popLayout">
            <motion.div
              key={activeTab}
              custom={direction}
              variants={{
                initial: (direction: number) => ({
                  x: direction > 0 ? 300 : -300,
                  opacity: 0,
                  filter: "blur(4px)",
                }),
                active: {
                  x: 0,
                  opacity: 1,
                  filter: "blur(0px)",
                },
                exit: (direction: number) => ({
                  x: direction > 0 ? -300 : 300,
                  opacity: 0,
                  filter: "blur(4px)",
                }),
              }}
              initial="initial"
              animate="active"
              exit="exit"
              onAnimationStart={onAnimationStart}
              onAnimationComplete={onAnimationComplete}
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </div>
      </motion.div>
    </MotionConfig>
  );
}
