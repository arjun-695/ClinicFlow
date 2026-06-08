import React from "react";
import Link from "next/link";
import HeaderSimple from "../../components/HeaderSimple";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 to-slate-900 text-slate-100">
      <HeaderSimple />

      <main className="max-w-5xl mx-auto px-6 py-16">
        <section className="grid gap-8 md:grid-cols-2 items-center">
          <div>
            <h1 className="text-4xl md:text-5xl font-extrabold leading-tight">
              ClinicFlow — Simple, secure patient records and EMR for doctors
            </h1>
            <p className="mt-4 text-slate-400 max-w-xl">
              Track patient files, manage appointments, log billing, and send
              WhatsApp reminders — all from a compact PWA built for doctors.
            </p>

            <div className="mt-8 flex items-center space-x-4">
              <Link
                href="/signup"
                className="px-6 py-3 rounded-2xl bg-indigo-500 text-white font-semibold shadow-lg"
              >
                Get Started — Sign Up
              </Link>
              <Link
                href="/signin"
                className="px-6 py-3 rounded-2xl border border-slate-800 text-slate-200"
              >
                Sign In
              </Link>
            </div>

            <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="p-3 rounded-2xl bg-slate-900/40 text-center">
                <strong className="block">EMR</strong>
                <span className="text-xs text-slate-400">Manage records</span>
              </div>
              <div className="p-3 rounded-2xl bg-slate-900/40 text-center">
                <strong className="block">Appointments</strong>
                <span className="text-xs text-slate-400">Track bookings</span>
              </div>
              <div className="p-3 rounded-2xl bg-slate-900/40 text-center">
                <strong className="block">Billing</strong>
                <span className="text-xs text-slate-400">Invoices & dues</span>
              </div>
              <div className="p-3 rounded-2xl bg-slate-900/40 text-center">
                <strong className="block">WhatsApp</strong>
                <span className="text-xs text-slate-400">
                  Automated notifications
                </span>
              </div>
            </div>
          </div>

          <div className="hidden md:block">
            <div className="w-full h-80 rounded-2xl bg-gradient-to-tr from-indigo-600 to-purple-600 p-8 shadow-2xl">
              <div className="h-full w-full bg-white/5 rounded-xl p-6 flex flex-col justify-between">
                <div className="text-white font-bold">App preview</div>
                <div className="bg-slate-900/70 rounded-xl p-4 text-slate-100">
                  Dashboard preview — patient lists, appointments, and quick invoice
                  generation.
                </div>
                <div className="text-xs text-slate-300">
                  PWA-ready • Offline-first
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-16 bg-slate-900/40 border border-slate-800 rounded-2xl p-6">
          <h3 className="text-xl font-semibold">Built for doctors</h3>
          <p className="mt-3 text-slate-400">
            ClinicFlow focuses on fast workflows: quick register patients, immediate
            billing, and clear outstanding balances. Export statements as PDF or
            notify patients via WhatsApp.
          </p>
        </section>
      </main>
    </div>
  );
}
