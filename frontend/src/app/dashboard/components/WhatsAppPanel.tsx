"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Smartphone, AlertCircle, CheckCircle2 } from "lucide-react";
import { fetchAPI } from "../../../utils/api";
import { cn } from "../../../utils/cn";

interface WhatsAppPanelProps {
  setToast: (
    toast: { message: string; type: "success" | "error" } | null,
  ) => void;
}

const WhatsAppPanel = React.memo(({ setToast }: WhatsAppPanelProps) => {
  const [waStatus, setWaStatus] = useState<
    "CONNECTED" | "DISCONNECTED" | "INITIALIZING"
  >("INITIALIZING");
  const [waQR, setWaQR] = useState("");
  const [waConnectedPhone, setWaConnectedPhone] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [pairPhone, setPairPhone] = useState("");
  const [pairPhoneCode, setPairPhoneCode] = useState("+91");
  const [pairCode, setPairCode] = useState("");
  const [isPairing, setIsPairing] = useState(false);
  const [hasPermission, setHasPermission] = useState(true);

  const getCombinedPhone = (phoneCode: string, rawPhone: string) => {
    const clean = rawPhone.replace(/[\s+-]/g, "");
    const codeDigits = phoneCode.replace("+", "");
    if (clean.startsWith(codeDigits) && clean.length > 10) {
      return `+${clean}`;
    }
    return `${phoneCode}${clean}`;
  };

  const loadWhatsAppStatus = useCallback(async () => {
    try {
      const data = await fetchAPI("/api/whatsapp/qr");
      setWaStatus(data.status);
      setWaQR(data.qr || "");
      setWaConnectedPhone(data.phone || "");
      setHasPermission(true);
    } catch (e: any) {
      console.error("Failed to load WhatsApp Status", e);
      if (e?.status === 403) {
        setHasPermission(false);
      }
    }
  }, []);

  // 5s status polling loop
  useEffect(() => {
    if (!hasPermission) return;
    loadWhatsAppStatus();
    let interval: ReturnType<typeof setInterval>;
    if (waStatus !== "CONNECTED") {
      interval = setInterval(loadWhatsAppStatus, 5000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [loadWhatsAppStatus, waStatus, hasPermission]);

  // Convert QR text to dataURL using dynamic import of qrcode
  useEffect(() => {
    if (waQR) {
      // Capture the current waQR to guard against stale resolutions
      const currentQR = waQR;
      import("qrcode")
        .then((QRCode) => {
          // Only apply result if waQR hasn't changed (prevent stale overwrites)
          if (currentQR === waQR) {
            QRCode.toDataURL(currentQR, { width: 220, margin: 1 })
              .then((dataUrl) => {
                if (currentQR === waQR) {
                  setQrDataUrl(dataUrl);
                }
              })
              .catch(() => {
                if (currentQR === waQR) {
                  setQrDataUrl("");
                }
              });
          }
        })
        .catch((err) => {
          if (currentQR === waQR) {
            console.error("Failed to load qrcode library dynamically", err);
            setQrDataUrl("");
          }
        });
    } else {
      setQrDataUrl("");
    }
  }, [waQR]);

  const handleWhatsAppPairing = async (e: React.FormEvent) => {
    e.preventDefault();
    const combinedPhone = getCombinedPhone(pairPhoneCode, pairPhone);
    if (!pairPhone) return;
    setIsPairing(true);

    try {
      const data = await fetchAPI("/api/whatsapp/pair-phone", {
        method: "POST",
        body: JSON.stringify({ phone: combinedPhone }),
      });
      setPairCode(data.pairing_code);
      setToast({
        message: "Pairing code generated! Link it on WhatsApp.",
        type: "success",
      });
    } catch (err: any) {
      setToast({
        message: err.message || "Failed to initiate phone pairing",
        type: "error",
      });
    } finally {
      setIsPairing(false);
    }
  };

  const handleWhatsAppDisconnect = async () => {
    if (
      !window.confirm(
        "Are you sure you want to disconnect WhatsApp? This will log out the linked device and stop sending automated notifications.",
      )
    ) {
      return;
    }
    try {
      await fetchAPI("/api/whatsapp/disconnect", {
        method: "POST",
      });
      setToast({
        message: "WhatsApp client disconnected successfully",
        type: "success",
      });
      setWaConnectedPhone("");
      loadWhatsAppStatus();
    } catch (err: any) {
      setToast({
        message: err.message || "Failed to disconnect WhatsApp",
        type: "error",
      });
    }
  };

  return (
    <div className="max-w-xl mx-auto bg-[var(--card)] border border-[var(--border)] rounded-3xl p-6 shadow-sm space-y-6">
      <div className="text-center space-y-2">
        <Smartphone className="w-12 h-12 text-indigo-500 mx-auto" />
        <h2 className="text-xl font-black">WhatsApp Device Linking</h2>
        <p className="text-xs text-slate-400">
          Connect your clinic WhatsApp account using whatsmeow QR code or
          pairing code. This enables instant bill slips dispatch.
        </p>
      </div>

      <div className="p-4 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center space-x-3 text-xs">
        <AlertCircle className="w-5 h-5 text-indigo-500 flex-shrink-0" />
        <div>
          <span className="font-bold">WhatsApp Client is: </span>
          <span
            className={cn(
              "font-black uppercase",
              !hasPermission
                ? "text-red-500"
                : waStatus === "CONNECTED"
                  ? "text-emerald-500"
                  : "text-amber-500 animate-pulse",
            )}
          >
            {!hasPermission ? "FORBIDDEN" : waStatus}
          </span>
        </div>
      </div>

      {!hasPermission ? (
        <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-center text-xs text-red-500 font-bold">
          Forbidden: You do not have permission to view WhatsApp settings for this workspace.
        </div>
      ) : waStatus !== "CONNECTED" && (
        <div className="space-y-6 border-t border-[var(--border)] pt-6">
          <div className="flex justify-center space-x-2 border border-[var(--border)] rounded-xl p-1 text-[10px] font-bold">
            <button
              onClick={() => {
                setPairCode("");
                loadWhatsAppStatus();
              }}
              className="flex-grow py-2 rounded-lg cursor-pointer bg-indigo-600 text-white border-none outline-none font-bold"
            >
              Link via QR Code
            </button>
          </div>

          {/* QR Code Stream */}
          {qrDataUrl ? (
            <div className="flex flex-col items-center space-y-4">
              <div className="p-3 bg-white rounded-3xl shadow-md border border-slate-200">
                <img
                  src={qrDataUrl}
                  alt="WhatsApp Pairing QR"
                  className="w-48 h-48 animate-fade-in"
                />
              </div>
              <p className="text-[10px] text-slate-400 text-center">
                Open WhatsApp on your phone → Linked Devices → Link a Device.
                Scan the QR code above.
              </p>
            </div>
          ) : (
            <div className="text-center text-xs text-slate-400 py-6 animate-pulse">
              Generating latest QR code pairing stream...
            </div>
          )}

          <div className="relative flex py-3 items-center">
            <div className="flex-grow border-t border-[var(--border)]"></div>
            <span className="flex-shrink mx-4 text-slate-400 text-[10px] uppercase font-bold">
              Or Link by phone number
            </span>
            <div className="flex-grow border-t border-[var(--border)]"></div>
          </div>

          {/* Phone Pairing Code */}
          <form onSubmit={handleWhatsAppPairing} className="space-y-3">
            <div>
              <label className="text-[10px] font-bold uppercase text-slate-400">
                Phone Number (with Country Code)
              </label>
              <div className="flex gap-2 mt-1">
                <div className="w-24 flex-shrink-0">
                  <select
                    value={pairPhoneCode}
                    onChange={(e) => setPairPhoneCode(e.target.value)}
                    className="w-full px-3 py-2 border border-[var(--border)] rounded-2xl bg-[var(--input-bg)] text-xs focus:ring-2 focus:ring-indigo-500 outline-none cursor-pointer h-[34px]"
                  >
                    <option value="+91">🇮🇳 +91</option>
                    <option value="+1">🇺🇸 +1</option>
                    <option value="+44">🇬🇧 +44</option>
                    <option value="+971">🇦🇪 +971</option>
                    <option value="+61">🇦🇺 +61</option>
                    <option value="+65">🇸🇬 +65</option>
                    <option value="+86">🇨🇳 +86</option>
                    <option value="+81">🇯🇵 +81</option>
                    <option value="+49">🇩🇪 +49</option>
                    <option value="+33">🇫🇷 +33</option>
                    <option value="+7">🇷🇺 +7</option>
                    <option value="+92">🇵🇰 +92</option>
                    <option value="+880">🇧🇩 +880</option>
                    <option value="+977">🇳🇵 +977</option>
                    <option value="+94">🇱🇰 +94</option>
                  </select>
                </div>
                <input
                  type="text"
                  placeholder="e.g. 9999999999"
                  value={pairPhone}
                  onChange={(e) => setPairPhone(e.target.value)}
                  className="flex-grow px-4 py-2 border border-[var(--border)] rounded-2xl bg-[var(--input-bg)] focus:outline-none text-xs h-[34px]"
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={isPairing}
              className="w-full py-2.5 bg-slate-900 dark:bg-slate-100 text-white dark:text-black font-bold rounded-2xl text-xs hover:opacity-90 transition cursor-pointer border-none"
            >
              {isPairing
                ? "Generating pairing code..."
                : "Generate Pairing Code"}
            </button>
          </form>

          {pairCode && (
            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-4 text-center space-y-2">
              <span className="text-[9px] uppercase font-bold text-emerald-500">
                Your Link Code
              </span>
              <div className="text-3xl font-black tracking-widest text-emerald-500">
                {pairCode}
              </div>
              <p className="text-[10px] text-slate-400">
                Enter this pairing code in WhatsApp Linked Devices → Link with
                Phone Number.
              </p>
            </div>
          )}
        </div>
      )}

      {waStatus === "CONNECTED" && (
        <div className="text-center py-6 text-xs text-slate-400 space-y-4 border border-[var(--border)] rounded-3xl bg-[var(--card)] p-6">
          <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-2 animate-bounce" />
          <div>
            <p className="font-bold text-slate-800 dark:text-slate-200">
              WhatsApp Client is Connected!
            </p>
            {waConnectedPhone && (
              <p className="text-[10px] text-slate-400 mt-1 font-mono">
                Logged in with:{" "}
                <strong className="text-emerald-500 font-bold">
                  +{waConnectedPhone}
                </strong>
              </p>
            )}
          </div>
          <button
            onClick={handleWhatsAppDisconnect}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-xl shadow-md transition cursor-pointer border-none outline-none"
          >
            Disconnect WhatsApp
          </button>
        </div>
      )}
    </div>
  );
});

WhatsAppPanel.displayName = "WhatsAppPanel";
export default WhatsAppPanel;
