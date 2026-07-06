"use client";

import React from "react";
import { motion } from "framer-motion";

export default function TabBubble() {
  return (
    <motion.span
      layoutId="activeTabBubble"
      className="absolute inset-0 z-0 bg-indigo-600 rounded-xl"
      transition={{ type: "spring", bounce: 0.15, duration: 0.38 }}
    />
  );
}
