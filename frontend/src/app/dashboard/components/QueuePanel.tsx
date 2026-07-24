"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Plus, ChevronUp, ChevronDown } from "lucide-react";
import { fetchAPI, API_URL } from "../../../utils/api";
import { cn } from "../../../utils/cn";
import dynamic from "next/dynamic";

const FloatingPanelRoot = dynamic(
  () =>
    import("../../../components/ui/floating-panel").then(
      (mod) => mod.FloatingPanelRoot,
    ),
  { ssr: false },
);
const FloatingPanelTrigger = dynamic(
  () =>
    import("../../../components/ui/floating-panel").then(
      (mod) => mod.FloatingPanelTrigger,
    ),
  { ssr: false },
);
const FloatingPanelContent = dynamic(
  () =>
    import("../../../components/ui/floating-panel").then(
      (mod) => mod.FloatingPanelContent,
    ),
  { ssr: false },
);
const FloatingPanelBody = dynamic(
  () =>
    import("../../../components/ui/floating-panel").then(
      (mod) => mod.FloatingPanelBody,
    ),
  { ssr: false },
);
const FloatingPanelCloseButton = dynamic(
  () =>
    import("../../../components/ui/floating-panel").then(
      (mod) => mod.FloatingPanelCloseButton,
    ),
  { ssr: false },
);
const FloatingPanelSubmitButton = dynamic(
  () =>
    import("../../../components/ui/floating-panel").then(
      (mod) => mod.FloatingPanelSubmitButton,
    ),
  { ssr: false },
);

interface Patient {
  id: number;
  name: string;
  phone: string;
  gender: string;
  age: number;
  medical_history: string;
  dues_count: number;
  total_dues: number;
  created_at: string;
}

interface QueuePanelProps {
  doctorInfo: any;
  patients: Patient[];
  facilityDoctors: any[];
  setToast: (
    toast: { message: string; type: "success" | "error" } | null,
  ) => void;
  isAuthenticated: boolean | null;
  ownPatientProfile: any;
  loadOwnPatientProfile: () => void;
}

const QueuePanel = React.memo(
  ({
    doctorInfo,
    patients,
    facilityDoctors,
    setToast,
    isAuthenticated,
    ownPatientProfile,
    loadOwnPatientProfile,
  }: QueuePanelProps) => {
    const [queueEntries, setQueueEntries] = useState<any[]>([]);
    const [isCheckInOpen, setIsCheckInOpen] = useState(false);
    const [checkinPatientId, setCheckinPatientId] = useState("");
    const [checkinReason, setCheckinReason] = useState("");
    const [checkinDoctorId, setCheckinDoctorId] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Derive stable board target from doctorInfo and ownPatientProfile
    const getBoardTarget = useCallback((): number | null => {
      if (doctorInfo?.role === "USER") {
        return ownPatientProfile?.patient?.doctor_id || null;
      }
      return doctorInfo?.id || null;
    }, [doctorInfo, ownPatientProfile?.patient?.doctor_id]);

    // Load queue using stable target
    const loadQueue = useCallback(async () => {
      try {
        const targetId = getBoardTarget();
        if (!targetId) return;
        const data = await fetchAPI(`/api/queue?doctor_id=${targetId}`);
        setQueueEntries(data || []);
      } catch (e) {
        console.error("Failed to load queue", e);
      }
    }, [getBoardTarget]);

    // Update status transition (call patient or complete consult)
    const handleStatusTransition = useCallback(
      async (entryId: number, newStatus: string) => {
        try {
          await fetchAPI("/api/queue/status", {
            method: "PUT",
            body: JSON.stringify({ entry_id: entryId, status: newStatus }),
          });
          loadQueue();
        } catch (e) {
          console.error("Failed to update queue status", e);
        }
      },
      [loadQueue],
    );

    // Reorder queue entries (swap adjacent WAITING entries)
    const handleReorder = useCallback(
      async (currentIdx: number, direction: "up" | "down") => {
        const newIdx = direction === "up" ? currentIdx - 1 : currentIdx + 1;
        if (newIdx < 0 || newIdx >= queueEntries.length) return;
        if (queueEntries[newIdx].status !== "WAITING") return;

        const updated = [...queueEntries];
        const temp = updated[currentIdx].queue_order;
        updated[currentIdx].queue_order = updated[newIdx].queue_order;
        updated[newIdx].queue_order = temp;

        try {
          await fetchAPI("/api/queue/reorder", {
            method: "PUT",
            body: JSON.stringify({
              orders: [
                {
                  id: updated[currentIdx].id,
                  queue_order: updated[currentIdx].queue_order,
                },
                {
                  id: updated[newIdx].id,
                  queue_order: updated[newIdx].queue_order,
                },
              ],
            }),
          });
          loadQueue();
        } catch (e) {
          console.error("Failed to reorder queue", e);
        }
      },
      [queueEntries, loadQueue],
    );

    useEffect(() => {
      loadQueue();
    }, [loadQueue]);

    // SSE Queue Stream Connection
    useEffect(() => {
      let ev: EventSource | null = null;

      const targetDoctorId = getBoardTarget();
      if (isAuthenticated && targetDoctorId) {
        const token = localStorage.getItem("auth_token");
        const url = `${API_URL}/api/queue/stream?doctor_id=${targetDoctorId}${token ? `&token=${token}` : ""}`;
        ev = new EventSource(url, { withCredentials: true });

        ev.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.event === "queue_update" || data.event === "update") {
              if (doctorInfo?.role === "USER") {
                loadOwnPatientProfile();
              }
              loadQueue();
            }
          } catch (err) {
            // Ignore
          }
        };
      }

      return () => {
        if (ev) {
          ev.close();
        }
      };
    }, [
      isAuthenticated,
      getBoardTarget,
      doctorInfo?.role,
      loadOwnPatientProfile,
      loadQueue,
    ]);

    // Auto-assign in check-in form
    useEffect(() => {
      if (isAuthenticated && doctorInfo) {
        const isClinicMode =
          doctorInfo.facilities?.find(
            (f: any) => f.id === doctorInfo.active_facility_id,
          )?.type !== "HOSPITAL";
        if (isClinicMode) {
          if (doctorInfo.role === "DOCTOR") {
            setCheckinDoctorId(doctorInfo.id.toString());
          } else if (facilityDoctors.length > 0) {
            setCheckinDoctorId(facilityDoctors[0].id.toString());
          }
        }
      }
    }, [isAuthenticated, doctorInfo, facilityDoctors]);

    const handleCheckInSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      if (doctorInfo?.role !== "USER" && !checkinPatientId) {
        setToast({ message: "Please select a patient", type: "error" });
        return;
      }
      const isClinicMode =
        doctorInfo?.facilities?.find(
          (f: any) => f.id === doctorInfo.active_facility_id,
        )?.type !== "HOSPITAL";
      const isDoctor = doctorInfo?.role === "DOCTOR";
      if (!isDoctor && !isClinicMode && !checkinDoctorId) {
        setToast({ message: "Please select a doctor", type: "error" });
        return;
      }
      setIsSubmitting(true);
      try {
        await fetchAPI("/api/queue/checkin", {
          method: "POST",
          body: JSON.stringify({
            patient_id:
              doctorInfo?.role === "USER" ? 0 : parseInt(checkinPatientId),
            doctor_id: isDoctor ? 0 : parseInt(checkinDoctorId),
            reason: checkinReason,
          }),
        });
        setToast({ message: "Checked in successfully!", type: "success" });
        setCheckinPatientId("");
        setCheckinReason("");
        setIsCheckInOpen(false);
        loadQueue();
      } catch (err: any) {
        setToast({ message: err.message || "Check-in failed", type: "error" });
      } finally {
        setIsSubmitting(false);
      }
    };

    return (
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h2 className="text-xl font-black">Clinic Queue Board</h2>
            <p className="text-xs text-slate-400">
              Track and manage checked-in patients in real-time.
            </p>
          </div>
          <FloatingPanelRoot
            isOpen={isCheckInOpen}
            onOpenChange={setIsCheckInOpen}
          >
            <FloatingPanelTrigger
              title={
                doctorInfo?.role === "USER"
                  ? "Check In to Queue"
                  : "Check In Patient"
              }
              className="flex items-center justify-center space-x-1.5 px-4 py-2 bg-indigo-600 text-white hover:bg-indigo-700 font-bold rounded-2xl text-xs shadow-md transition cursor-pointer border-none"
            >
              <Plus className="w-4 h-4 mr-1.5" />
              <span>
                {doctorInfo?.role === "USER"
                  ? "Check In to Queue"
                  : "Check In Patient"}
              </span>
            </FloatingPanelTrigger>
            <FloatingPanelContent className="w-80 sm:w-96 text-left">
              <FloatingPanelBody>
                <form
                  onSubmit={handleCheckInSubmit}
                  className="space-y-4 text-xs text-[var(--foreground)]"
                >
                  {doctorInfo?.role !== "USER" && (
                    <div>
                      <label className="text-[10px] font-bold uppercase text-slate-400">
                        Select Checked-In Patient
                      </label>
                      <select
                        required
                        value={checkinPatientId}
                        onChange={(e) => setCheckinPatientId(e.target.value)}
                        className="w-full mt-1 px-4 py-2 border border-[var(--border)] rounded-2xl bg-[var(--input-bg)] text-xs focus:ring-2 focus:ring-indigo-500 outline-none"
                      >
                        <option value="">-- Choose Patient --</option>
                        {patients.map((pt) => (
                          <option key={pt.id} value={pt.id}>
                            {pt.name} ({pt.phone})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {doctorInfo?.role !== "DOCTOR" && (
                    <div>
                      <label className="text-[10px] font-bold uppercase text-slate-400">
                        Select Doctor
                      </label>
                      <select
                        required
                        value={checkinDoctorId}
                        onChange={(e) => setCheckinDoctorId(e.target.value)}
                        className="w-full mt-1 px-4 py-2 border border-[var(--border)] rounded-2xl bg-[var(--input-bg)] text-xs focus:ring-2 focus:ring-indigo-500 outline-none"
                      >
                        <option value="">-- Choose Doctor --</option>
                        {facilityDoctors.map((doc) => (
                          <option key={doc.id} value={doc.id}>
                            Dr. {doc.name} ({doc.specialization || "General"})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div>
                    <label className="text-[10px] font-bold uppercase text-slate-400">
                      Consultation Reason / Check-in Notes
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Fever, Follow-up"
                      value={checkinReason}
                      onChange={(e) => setCheckinReason(e.target.value)}
                      className="w-full mt-1 px-4 py-2 border border-[var(--border)] rounded-2xl bg-[var(--input-bg)] text-xs focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                  </div>

                  <div className="flex space-x-2 pt-2 text-xs">
                    <FloatingPanelCloseButton className="w-1/2 py-2.5 rounded-2xl border border-[var(--border)] font-bold text-slate-500 hover:bg-[var(--card-hover)] transition cursor-pointer justify-center" />
                    <FloatingPanelSubmitButton
                      label="Check In"
                      className="w-1/2 py-2.5 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold shadow-md transition cursor-pointer ml-0 h-auto justify-center"
                    />
                  </div>
                </form>
              </FloatingPanelBody>
            </FloatingPanelContent>
          </FloatingPanelRoot>
        </div>

        {/* Queue Table */}
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-3xl overflow-hidden transition-all shadow-sm">
          {/* Mobile Card List View for Queue */}
          <div className="block md:hidden divide-y divide-[var(--border)] bg-[var(--card)]">
            {queueEntries.length > 0 ? (
              queueEntries.map((entry, idx) => {
                const isUserOwn =
                  doctorInfo?.role === "USER" &&
                  entry.patient_phone === doctorInfo.phone;
                return (
                  <div
                    key={entry.id}
                    className={cn(
                      "p-4 hover:bg-[var(--accent)] transition space-y-3",
                      isUserOwn ? "bg-indigo-500/5 font-semibold" : "",
                    )}
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex items-center space-x-2">
                        <span className="w-6 h-6 rounded-full bg-slate-100 dark:bg-slate-800 text-xs font-black flex items-center justify-center text-zinc-950 dark:text-zinc-50">
                          {idx + 1}
                        </span>
                        <div>
                          <span className="font-bold text-sm text-zinc-900 dark:text-zinc-100">
                            {entry.patient_name}{" "}
                            {isUserOwn && (
                              <span className="text-[9px] text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded-full ml-1">
                                You
                              </span>
                            )}
                          </span>
                          {entry.doctor_name && (
                            <div className="text-[10px] text-slate-400 font-medium mt-0.5">
                              Assigned: Dr. {entry.doctor_name}
                            </div>
                          )}
                        </div>
                      </div>
                      <span
                        className={cn(
                          "inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-bold",
                          entry.status === "IN_CONSULTATION"
                            ? "bg-amber-500/10 text-amber-500"
                            : "bg-indigo-500/10 text-indigo-500",
                        )}
                      >
                        {entry.status}
                      </span>
                    </div>

                    <div className="flex justify-between items-center text-xs text-slate-500 dark:text-slate-400">
                      <span>
                        Check-in:{" "}
                        {new Date(entry.check_in_time).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                      <span className="text-indigo-500 font-bold">
                        {entry.status === "IN_CONSULTATION"
                          ? "In Consult"
                          : `${entry.estimated_wait_minutes} mins`}
                      </span>
                    </div>

                    {doctorInfo?.role !== "USER" && (
                      <div className="flex justify-end items-center gap-2 pt-1">
                        {entry.status === "WAITING" && (
                          <button
                            onClick={() =>
                              handleStatusTransition(
                                entry.id,
                                "IN_CONSULTATION",
                              )
                            }
                            className="px-3 py-1.5 bg-amber-500/10 text-amber-500 hover:bg-amber-500/20 text-[10px] font-bold rounded-xl transition cursor-pointer border-none outline-none font-bold"
                          >
                            Call Patient
                          </button>
                        )}
                        {entry.status === "IN_CONSULTATION" && (
                          <button
                            onClick={() =>
                              handleStatusTransition(entry.id, "COMPLETED")
                            }
                            className="px-3 py-1.5 bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 text-[10px] font-bold rounded-xl transition cursor-pointer border-none outline-none font-bold"
                          >
                            Complete Consult
                          </button>
                        )}
                        {entry.status === "WAITING" && (
                          <div className="flex items-center gap-1">
                            <button
                              disabled={
                                idx === 0 ||
                                queueEntries[idx - 1].status !== "WAITING"
                              }
                              onClick={() => handleReorder(idx, "up")}
                              className="p-1 border border-[var(--border)] rounded-lg hover:bg-[var(--card-hover)] text-slate-400 disabled:opacity-30 cursor-pointer bg-transparent"
                            >
                              <ChevronUp className="w-3.5 h-3.5" />
                            </button>
                            <button
                              disabled={
                                idx === queueEntries.length - 1 ||
                                queueEntries[idx + 1].status !== "WAITING"
                              }
                              onClick={() => handleReorder(idx, "down")}
                              className="p-1 border border-[var(--border)] rounded-lg hover:bg-[var(--card-hover)] text-slate-400 disabled:opacity-30 cursor-pointer bg-transparent"
                            >
                              <ChevronDown className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            ) : (
              <div className="p-8 text-center text-slate-400 font-semibold">
                No patients currently checked in today.
              </div>
            )}
          </div>

          {/* Desktop Table View */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-[var(--border)] bg-[var(--nav-bg)] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider">
                  <th className="px-6 py-4">Position</th>
                  <th className="px-6 py-4">Patient Name</th>
                  <th className="px-6 py-4">Check-in Time</th>
                  <th className="px-6 py-4">Est. Wait Time</th>
                  <th className="px-6 py-4">Status</th>
                  {doctorInfo?.role !== "USER" && (
                    <th className="px-6 py-4 text-right">Actions</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {queueEntries.length > 0 ? (
                  queueEntries.map((entry, idx) => {
                    const isUserOwn =
                      doctorInfo?.role === "USER" &&
                      entry.patient_phone === doctorInfo.phone;
                    return (
                      <tr
                        key={entry.id}
                        className={cn(
                          "border-b border-[var(--border)] hover:bg-table-row-hover transition",
                          isUserOwn ? "bg-indigo-500/5 font-semibold" : "",
                        )}
                      >
                        <td className="px-6 py-4 text-sm font-black">
                          {idx + 1}
                        </td>
                        <td className="px-6 py-4 text-sm">
                          <div className="font-bold text-zinc-900 dark:text-zinc-100">
                            {entry.patient_name}{" "}
                            {isUserOwn && (
                              <span className="text-[10px] text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded-full ml-1">
                                You
                              </span>
                            )}
                          </div>
                          {entry.doctor_name && (
                            <div className="text-[10px] text-slate-400 font-medium mt-0.5">
                              Assigned: Dr. {entry.doctor_name}
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-4 text-slate-500">
                          {new Date(entry.check_in_time).toLocaleTimeString()}
                        </td>
                        <td className="px-6 py-4 text-indigo-500 font-bold">
                          {entry.status === "IN_CONSULTATION"
                            ? "In Consult"
                            : `${entry.estimated_wait_minutes} mins`}
                        </td>
                        <td className="px-6 py-4">
                          <span
                            className={cn(
                              "inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-bold",
                              entry.status === "IN_CONSULTATION"
                                ? "bg-amber-500/10 text-amber-500"
                                : "bg-indigo-500/10 text-indigo-500",
                            )}
                          >
                            {entry.status}
                          </span>
                        </td>
                        {doctorInfo?.role !== "USER" && (
                          <td className="px-6 py-4 text-right flex items-center justify-end gap-2">
                            {entry.status === "WAITING" && (
                              <button
                                onClick={() =>
                                  handleStatusTransition(
                                    entry.id,
                                    "IN_CONSULTATION",
                                  )
                                }
                                className="px-3 py-1.5 bg-amber-500/10 text-amber-500 hover:bg-amber-500/20 text-[10px] font-bold rounded-xl transition cursor-pointer border-none outline-none font-bold"
                              >
                                Call Patient
                              </button>
                            )}
                            {entry.status === "IN_CONSULTATION" && (
                              <button
                                onClick={() =>
                                  handleStatusTransition(entry.id, "COMPLETED")
                                }
                                className="px-3 py-1.5 bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 text-[10px] font-bold rounded-xl transition cursor-pointer border-none outline-none font-bold"
                              >
                                Complete Consult
                              </button>
                            )}
                            {/* Reordering Controls */}
                            {entry.status === "WAITING" && (
                              <div className="flex items-center gap-1">
                                <button
                                  disabled={
                                    idx === 0 ||
                                    queueEntries[idx - 1].status !== "WAITING"
                                  }
                                  onClick={() => handleReorder(idx, "up")}
                                  className="p-1 border border-[var(--border)] rounded-lg hover:bg-[var(--card-hover)] text-slate-400 disabled:opacity-30 cursor-pointer bg-transparent"
                                >
                                  <ChevronUp className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  disabled={
                                    idx === queueEntries.length - 1 ||
                                    queueEntries[idx + 1].status !== "WAITING"
                                  }
                                  onClick={() => handleReorder(idx, "down")}
                                  className="p-1 border border-[var(--border)] rounded-lg hover:bg-[var(--card-hover)] text-slate-400 disabled:opacity-30 cursor-pointer bg-transparent"
                                >
                                  <ChevronDown className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td
                      colSpan={doctorInfo?.role === "USER" ? 5 : 6}
                      className="px-6 py-12 text-center text-slate-400 font-semibold"
                    >
                      No patients currently checked in today.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  },
);

QueuePanel.displayName = "QueuePanel";
export default QueuePanel;
