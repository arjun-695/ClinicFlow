"use client";

import Link from "next/link";
import React from "react";

export default function HeaderSimple() {
  return (
    <header className="w-full max-w-5xl mx-auto px-6 py-6 flex items-center justify-between">
      <div className="flex items-center space-x-3">
        <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-indigo-500 to-purple-600 flex items-center justify-center shadow-md">
          <span className="font-bold text-white">CL</span>
        </div>
        <div>
          <h3 className="text-lg font-semibold">Clinically</h3>
          <p className="text-xs text-slate-400">Patient EMR & Billing</p>
        </div>
      </div>

      <nav className="flex items-center space-x-3">
        <Link
          href="/signin"
          className="px-4 py-2 rounded-2xl border border-slate-800 text-sm text-slate-200 hover:bg-slate-900/50 transition"
        >
          Sign In
        </Link>
        <Link
          href="/signup"
          className="px-4 py-2 rounded-2xl bg-indigo-500 text-sm font-semibold text-white hover:opacity-95 transition"
        >
          Sign Up
        </Link>
      </nav>
    </header>
  );
}
