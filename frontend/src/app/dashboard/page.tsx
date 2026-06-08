"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  Users,
  Calendar,
  FileText,
  Activity,
  Smartphone,
  Search,
  Plus,
  ArrowLeft,
  CheckCircle2,
  XCircle,
  Clock,
  Download,
  LogOut,
  PlusCircle,
  MinusCircle,
  Sun,
  Moon,
  TrendingUp,
  DollarSign,
  BriefcaseMedical,
  AlertCircle,
  Pencil,
  Trash2,
  ArrowUpDown,
  Save,
  X,
  Edit3,
  ChevronDown,
  ChevronUp,
  RotateCcw
} from "lucide-react";
import { fetchAPI, API_URL } from "../../utils/api";
import { ThemeToggleButton } from "../../components/ui/theme-toggle";
import { cn } from "../../utils/cn";
import { jsPDF } from "jspdf";
import QRCode from "qrcode";
import { useRouter } from "next/navigation";
import {
  FloatingPanelRoot,
  FloatingPanelTrigger,
  FloatingPanelContent,
  FloatingPanelBody,
  FloatingPanelFooter,
  FloatingPanelCloseButton,
  FloatingPanelSubmitButton,
} from "../../components/ui/floating-panel";

// --- State Types ---
type ViewState =
  | { type: "list" }
  | { type: "patient"; patientId: number }
  | { type: "bill"; billId: number };

// --- Interfaces ---
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

interface BillItem {
  id?: number;
  item_name: string;
  quantity: number;
  unit_price: number;
  dosage: string;
}

interface Bill {
  id: number;
  patient_id: number;
  patient_name: string;
  patient_phone: string;
  doctor_id: number;
  clinic_name: string;
  description: string;
  total_amount: number;
  remaining_amount: number;
  status: "PENDING" | "PARTIALLY_PAID" | "SETTLED";
  promised_due_date: string | null;
  invoice_url: string | null;
  created_at: string;
  notified: boolean;
}

interface Appointment {
  id: number;
  patient_id: number;
  patient_name: string;
  patient_phone: string;
  doctor_id: number;
  appointment_date: string;
  status: "PENDING" | "COMPLETED" | "CANCELLED";
  reason: string;
  created_at: string;
}

interface Medicine {
  id: number;
  name: string;
  stock: number;
  price: number;
}

interface Payment {
  id: number;
  contract_id: number; // mapped back from bill_id
  amount_paid: number;
  payment_mode: string;
  remarks: string;
  payment_date: string;
}

interface PatientDetail {
  patient: Patient;
  contracts: Bill[]; // mapped to contracts key for dashboard compatibility
  appointments: Appointment[];
}

interface BillDetail {
  bill: Bill;
  items: BillItem[];
  payments: Payment[];
}

interface DataPoint {
  label: string;
  value: number;
}

interface AnalyticsData {
  patients_weekly: DataPoint[];
  patients_monthly: DataPoint[];
  patients_yearly: DataPoint[];
  revenue_daily: DataPoint[];
  appointments_future: DataPoint[];
}

export default function Dashboard() {
  const router = useRouter();

  // Authentication & Theme
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [doctorInfo, setDoctorInfo] = useState<{ name: string; clinic_name: string } | null>(null);


  // Tabs & Views
  const [activeTab, setActiveTab] = useState<
    "patients" | "appointments" | "billing" | "medicines" | "analytics" | "whatsapp"
  >("patients");
  const [viewState, setViewState] = useState<ViewState>({ type: "list" });

  // Core Data
  const [patients, setPatients] = useState<Patient[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [currentPatientData, setCurrentPatientData] = useState<PatientDetail | null>(null);
  const [currentBillData, setCurrentBillData] = useState<BillDetail | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Modals Open/Close
  const [isAddPatientOpen, setIsAddPatientOpen] = useState(false);
  const [isAddAppointmentOpen, setIsAddAppointmentOpen] = useState(false);
  const [isCreateBillOpen, setIsCreateBillOpen] = useState(false);
  const [isLogPaymentOpen, setIsLogPaymentOpen] = useState(false);
  const [isAddMedicineOpen, setIsAddMedicineOpen] = useState(false);

  // Forms State
  // 1. Patient Form
  const [newPtName, setNewPtName] = useState("");
  const [newPtPhone, setNewPtPhone] = useState("");
  const [newPtGender, setNewPtGender] = useState("Male");
  const [newPtAge, setNewPtAge] = useState("");
  const [newPtHistory, setNewPtHistory] = useState("");

  // 2. Appointment Form
  const [apptPatientId, setApptPatientId] = useState("");
  const [apptDate, setApptDate] = useState("");
  const [apptReason, setApptReason] = useState("");

  // 3. Billing Form
  const [billPatientId, setBillPatientId] = useState("");
  const [billDesc, setBillDesc] = useState("");
  const [billDueDate, setBillDueDate] = useState("");
  const [billItems, setBillItems] = useState<BillItem[]>([{ item_name: "", quantity: 1, unit_price: 0, dosage: "" }]);
  const [focusedMedIndex, setFocusedMedIndex] = useState<number | null>(null);
  const [billAmountPaid, setBillAmountPaid] = useState("");
  const [billPayMode, setBillPayMode] = useState<"CASH" | "ONLINE_UPI" | "BANK_TRANSFER">("CASH");
  const [billPayRemarks, setBillPayRemarks] = useState("");
  const [billFile, setBillFile] = useState<File | null>(null);

  // 4. Log Payment Form
  const [payAmount, setPayAmount] = useState("");
  const [payMode, setPayMode] = useState<"CASH" | "ONLINE_UPI" | "BANK_TRANSFER">("CASH");
  const [payRemarks, setPayRemarks] = useState("");

  // 5. Medicine Form
  const [medName, setMedName] = useState("");
  const [medPrice, setMedPrice] = useState("");
  const [medStock, setMedStock] = useState("");

  // Pharmacy search/sort
  const [medSearchQuery, setMedSearchQuery] = useState("");
  const [medSortBy, setMedSortBy] = useState<"name" | "stock" | "availability">("name");
  const [medSortAsc, setMedSortAsc] = useState(true);

  // Medicine inline editing
  const [editingMedId, setEditingMedId] = useState<number | null>(null);
  const [editMedName, setEditMedName] = useState("");
  const [editMedStock, setEditMedStock] = useState("");
  const [editMedPrice, setEditMedPrice] = useState("");

  // Recent bills for billing tab
  const [recentBills, setRecentBills] = useState<Bill[]>([]);
  const [billSearchQuery, setBillSearchQuery] = useState("");
  const [billsOffset, setBillsOffset] = useState(0);
  const [billsTotalCount, setBillsTotalCount] = useState(0);
  const [billsLoading, setBillsLoading] = useState(false);

  // Profile editing
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [editClinicName, setEditClinicName] = useState("");
  const [editDoctorName, setEditDoctorName] = useState("");

  // WhatsApp templates
  const [waTemplates, setWaTemplates] = useState<Record<string, { greeting: string; body: string; footer: string }>>({
    bill_notification: { greeting: "", body: "", footer: "" },
    overdue_reminder: { greeting: "", body: "", footer: "" },
  });
  const [editingTemplate, setEditingTemplate] = useState<string | null>(null);
  const [templateSaving, setTemplateSaving] = useState(false);

  // WhatsApp QR
  const [waStatus, setWaStatus] = useState<"CONNECTED" | "DISCONNECTED" | "INITIALIZING">("INITIALIZING");
  const [waQR, setWaQR] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [pairPhone, setPairPhone] = useState("");
  const [pairCode, setPairCode] = useState("");
  const [isPairing, setIsPairing] = useState(false);

  // Chart Timeframe Selection
  const [patientTimeframe, setPatientTimeframe] = useState<"weekly" | "monthly" | "yearly">("weekly");
  const [hoveredData, setHoveredData] = useState<{ label: string; value: number; x: number; y: number } | null>(null);

  // Toast
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Auto-dismiss toast
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // --- Theme toggling handled via next-themes and ThemeToggleButton ---

  // --- Auth Check ---
  useEffect(() => {
    checkAuthSession();
  }, []);

  const checkAuthSession = async () => {
    try {
      const data = await fetchAPI("/api/auth/session");
      if (data.status === "Authenticated") {
        setIsAuthenticated(true);
        setDoctorInfo({
          name: data.user.name,
          clinic_name: data.user.clinic_name || data.user.shop_name || "My Clinic"
        });
      } else {
        setIsAuthenticated(false);
        router.push("/signin");
      }
    } catch {
      setIsAuthenticated(false);
      router.push("/signin");
    }
  };

  // --- Load Data Hook ---
  useEffect(() => {
    if (isAuthenticated) {
      loadPatients();
      loadAppointments();
      loadMedicines();
      loadAnalytics();
      loadWhatsAppStatus();
      loadRecentBills();
      loadWhatsAppTemplates();
    }
  }, [isAuthenticated]);

  // Refresh QR
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (isAuthenticated && activeTab === "whatsapp" && waStatus !== "CONNECTED") {
      loadWhatsAppStatus();
      interval = setInterval(loadWhatsAppStatus, 5000);
    }
    return () => clearInterval(interval);
  }, [isAuthenticated, activeTab, waStatus]);

  // Convert QR text to dataURL
  useEffect(() => {
    if (waQR) {
      QRCode.toDataURL(waQR, { width: 220, margin: 1 })
        .then(setQrDataUrl)
        .catch(() => setQrDataUrl(""));
    } else {
      setQrDataUrl("");
    }
  }, [waQR]);

  // Keep details updated
  useEffect(() => {
    if (viewState.type === "patient") {
      loadPatientDetails(viewState.patientId);
    } else if (viewState.type === "bill") {
      loadBillDetails(viewState.billId);
    }
  }, [viewState]);

  // --- API Loaders ---
  const loadPatients = async () => {
    try {
      const data = await fetchAPI("/api/patients");
      setPatients(data || []);
    } catch (e) {
      console.error("Failed to load patients", e);
    }
  };

  const loadAppointments = async () => {
    try {
      const data = await fetchAPI("/api/appointments");
      setAppointments(data || []);
    } catch (e) {
      console.error("Failed to load appointments", e);
    }
  };

  const loadMedicines = async () => {
    try {
      const data = await fetchAPI("/api/medicines");
      setMedicines(data || []);
    } catch (e) {
      console.error("Failed to load medicines", e);
    }
  };

  const loadAnalytics = async () => {
    try {
      const data = await fetchAPI("/api/analytics");
      setAnalytics(data);
    } catch (e) {
      console.error("Failed to load analytics", e);
    }
  };

  const loadWhatsAppStatus = async () => {
    try {
      const data = await fetchAPI("/api/whatsapp/qr");
      setWaStatus(data.status);
      setWaQR(data.qr || "");
    } catch (e) {
      console.error("Failed to load WhatsApp Status", e);
    }
  };

  const loadPatientDetails = async (id: number) => {
    try {
      const data = await fetchAPI(`/api/patients/detail?id=${id}`);
      setCurrentPatientData({
        patient: data.patient,
        contracts: data.contracts || [],
        appointments: data.appointments || []
      });
    } catch {
      setToast({ message: "Failed to load patient profile", type: "error" });
      setViewState({ type: "list" });
    }
  };

  const loadBillDetails = async (id: number) => {
    try {
      const data = await fetchAPI(`/api/bills/detail?id=${id}`);
      setCurrentBillData(data);
    } catch {
      setToast({ message: "Failed to load invoice details", type: "error" });
      if (currentPatientData) {
        setViewState({ type: "patient", patientId: currentPatientData.patient.id });
      } else {
        setViewState({ type: "list" });
      }
    }
  };

  // Load recent bills
  const loadRecentBills = async (search = "", offset = 0, append = false) => {
    setBillsLoading(true);
    try {
      const data = await fetchAPI(`/api/bills?search=${encodeURIComponent(search)}&offset=${offset}&limit=20`);
      if (append) {
        setRecentBills(prev => [...prev, ...(data.bills || [])]);
      } else {
        setRecentBills(data.bills || []);
      }
      setBillsTotalCount(data.total_count || 0);
      setBillsOffset(offset);
    } catch (e) {
      console.error("Failed to load bills", e);
    } finally {
      setBillsLoading(false);
    }
  };

  // Update medicine
  const handleUpdateMedicine = async (id: number) => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      await fetchAPI("/api/medicines", {
        method: "PUT",
        body: JSON.stringify({
          id,
          name: editMedName,
          stock: parseInt(editMedStock) || 0,
          price: parseFloat(editMedPrice) || 0,
        }),
      });
      setToast({ message: "Medicine updated successfully", type: "success" });
      setEditingMedId(null);
      loadMedicines();
    } catch {
      setToast({ message: "Failed to update medicine", type: "error" });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Delete medicine
  const handleDeleteMedicine = async (id: number, name: string) => {
    if (!confirm(`Delete "${name}" from pharmacy catalog?`)) return;
    try {
      await fetchAPI("/api/medicines", {
        method: "DELETE",
        body: JSON.stringify({ id }),
      });
      setToast({ message: "Medicine removed from catalog", type: "success" });
      loadMedicines();
    } catch {
      setToast({ message: "Failed to delete medicine", type: "error" });
    }
  };

  // Update profile
  const handleUpdateProfile = async () => {
    if (!editDoctorName.trim()) return;
    setIsSubmitting(true);
    try {
      const data = await fetchAPI("/api/auth/profile", {
        method: "PUT",
        body: JSON.stringify({
          clinic_name: editClinicName.trim() || "My Clinic",
          name: editDoctorName.trim(),
          phone: "",
        }),
      });
      setDoctorInfo({
        name: editDoctorName.trim(),
        clinic_name: editClinicName.trim() || "My Clinic",
      });
      setIsEditingProfile(false);
      setToast({ message: "Profile updated successfully", type: "success" });
    } catch {
      setToast({ message: "Failed to update profile", type: "error" });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Load WhatsApp templates
  const loadWhatsAppTemplates = async () => {
    try {
      const data = await fetchAPI("/api/whatsapp/templates");
      setWaTemplates({
        bill_notification: {
          greeting: data.bill_notification?.greeting || "",
          body: data.bill_notification?.body || "",
          footer: data.bill_notification?.footer || "",
        },
        overdue_reminder: {
          greeting: data.overdue_reminder?.greeting || "",
          body: data.overdue_reminder?.body || "",
          footer: data.overdue_reminder?.footer || "",
        },
      });
    } catch (e) {
      console.error("Failed to load templates", e);
    }
  };

  // Save WhatsApp template
  const handleSaveTemplate = async (key: string) => {
    setTemplateSaving(true);
    try {
      await fetchAPI("/api/whatsapp/templates", {
        method: "PUT",
        body: JSON.stringify({
          template_key: key,
          greeting: waTemplates[key].greeting,
          body: waTemplates[key].body,
          footer: waTemplates[key].footer,
        }),
      });
      setToast({ message: "Template saved successfully", type: "success" });
      setEditingTemplate(null);
    } catch {
      setToast({ message: "Failed to save template", type: "error" });
    } finally {
      setTemplateSaving(false);
    }
  };

  const handleLogout = async () => {
    try {
      await fetchAPI("/api/auth/logout");
      setIsAuthenticated(false);
      router.push("/");
    } catch (e) {
      console.error("Logout failed", e);
    }
  };

  // --- Handlers ---
  const handleAddPatient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPtName || !newPtPhone) return;
    if (isSubmitting) return;
    setIsSubmitting(true);

    try {
      await fetchAPI("/api/patients", {
        method: "POST",
        body: JSON.stringify({
          name: newPtName,
          phone: newPtPhone,
          gender: newPtGender,
          age: parseInt(newPtAge) || 0,
          medical_history: newPtHistory
        })
      });
      setToast({ message: "Patient registered successfully", type: "success" });
      setNewPtName("");
      setNewPtPhone("");
      setNewPtAge("");
      setNewPtHistory("");
      setIsAddPatientOpen(false);
      loadPatients();
    } catch {
      setToast({ message: "Failed to register patient", type: "error" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAddAppointment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!apptPatientId || !apptDate) return;
    if (isSubmitting) return;
    setIsSubmitting(true);

    try {
      await fetchAPI("/api/appointments", {
        method: "POST",
        body: JSON.stringify({
          patient_id: parseInt(apptPatientId),
          appointment_date: apptDate,
          reason: apptReason
        })
      });
      setToast({ message: "Appointment booked successfully", type: "success" });
      setApptPatientId("");
      setApptDate("");
      setApptReason("");
      setIsAddAppointmentOpen(false);
      loadAppointments();
      loadAnalytics();
    } catch {
      setToast({ message: "Failed to book appointment", type: "error" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleAppointmentStatus = async (id: number, currentStatus: string) => {
    const nextStatus = currentStatus === "PENDING" ? "COMPLETED" : "PENDING";
    try {
      await fetchAPI("/api/appointments/status", {
        method: "PUT",
        body: JSON.stringify({ id, status: nextStatus })
      });
      setToast({ message: `Slot status updated to ${nextStatus}`, type: "success" });
      loadAppointments();
      loadAnalytics();
      if (viewState.type === "patient") {
        loadPatientDetails(viewState.patientId);
      }
    } catch {
      setToast({ message: "Failed to update appointment", type: "error" });
    }
  };

  const handleBillItemChange = (index: number, field: keyof BillItem, value: any) => {
    const updated = [...billItems];
    if (field === "quantity") {
      updated[index].quantity = Math.max(1, parseInt(value) || 1);
    } else if (field === "unit_price") {
      updated[index].unit_price = Math.max(0, parseFloat(value) || 0);
    } else {
      updated[index][field] = value as never;
    }
    setBillItems(updated);
  };

  const addBillItemRow = () => {
    setBillItems([...billItems, { item_name: "", quantity: 1, unit_price: 0, dosage: "" }]);
  };

  const removeBillItemRow = (index: number) => {
    if (billItems.length > 1) {
      setBillItems(billItems.filter((_, idx) => idx !== index));
    }
  };

  const getBillTotal = () => {
    return billItems.reduce((sum, item) => sum + item.quantity * item.unit_price, 0);
  };

  const handleCreateBill = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!billPatientId || !billDesc) return;
    if (isSubmitting) return;
    setIsSubmitting(true);

    try {
      const formData = new FormData();
      formData.append("patient_id", billPatientId);
      formData.append("description", billDesc);
      formData.append("promised_due_date", billDueDate);
      formData.append("items", JSON.stringify(billItems));
      if (billAmountPaid) {
        formData.append("amount_paid", billAmountPaid);
        formData.append("payment_mode", billPayMode);
        formData.append("payment_remarks", billPayRemarks);
      }
      if (billFile) {
        formData.append("invoice", billFile);
      }

      const res = await fetchAPI("/api/bills", {
        method: "POST",
        body: formData
      });

      setToast({ message: "Bill composted and WhatsApp notification scheduled", type: "success" });
      setBillPatientId("");
      setBillDesc("");
      setBillDueDate("");
      setBillAmountPaid("");
      setBillPayRemarks("");
      setBillFile(null);
      setBillItems([{ item_name: "", quantity: 1, unit_price: 0, dosage: "" }]);
      setIsCreateBillOpen(false);

      loadPatients();
      loadAnalytics();
      loadRecentBills();

      if (res.bill_id) {
        setViewState({ type: "bill", billId: res.bill_id });
      }
    } catch {
      setToast({ message: "Failed to generate bill", type: "error" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLogPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payAmount || !currentBillData) return;
    if (isSubmitting) return;
    setIsSubmitting(true);

    try {
      await fetchAPI("/api/payments", {
        method: "POST",
        body: JSON.stringify({
          contract_id: currentBillData.bill.id,
          amount_paid: parseFloat(payAmount),
          payment_mode: payMode,
          remarks: payRemarks
        })
      });

      setToast({ message: "Payment logged successfully", type: "success" });
      setPayAmount("");
      setPayRemarks("");
      setIsLogPaymentOpen(false);
      loadBillDetails(currentBillData.bill.id);
      loadAnalytics();
      loadRecentBills();
      if (currentPatientData) {
        loadPatientDetails(currentPatientData.patient.id);
      }
    } catch {
      setToast({ message: "Failed to log payment", type: "error" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAddMedicine = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!medName || !medPrice) return;
    if (isSubmitting) return;
    setIsSubmitting(true);

    try {
      await fetchAPI("/api/medicines", {
        method: "POST",
        body: JSON.stringify({
          name: medName,
          price: parseFloat(medPrice),
          stock: parseInt(medStock) || 0
        })
      });
      setToast({ message: "Medicine added to catalog", type: "success" });
      setMedName("");
      setMedPrice("");
      setMedStock("");
      setIsAddMedicineOpen(false);
      loadMedicines();
    } catch {
      setToast({ message: "Failed to add medicine", type: "error" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleWhatsAppPairing = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pairPhone) return;
    setIsPairing(true);

    try {
      const data = await fetchAPI("/api/whatsapp/pair-phone", {
        method: "POST",
        body: JSON.stringify({ phone: pairPhone })
      });
      setPairCode(data.pairing_code);
      setToast({ message: "Pairing code generated! Link it on WhatsApp.", type: "success" });
    } catch (e: any) {
      setToast({ message: e.message || "Failed to initiate phone pairing", type: "error" });
    } finally {
      setIsPairing(false);
    }
  };

  const generateInvoicePDF = (detail: BillDetail) => {
    const doc = new jsPDF();
    const { bill, items, payments } = detail;

    // Header
    doc.setFont("helvetica", "bold");
    doc.setFontSize(22);
    doc.setTextColor(99, 102, 241);
    doc.text(bill.clinic_name || "ClinicFlow Medical Invoice", 20, 25);

    // Metadata
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 116, 139);
    doc.text(`Invoice ID: #INV-${bill.id}`, 20, 32);
    doc.text(`Date: ${new Date(bill.created_at).toLocaleDateString()}`, 20, 37);
    if (bill.promised_due_date) {
      doc.text(`Due Date: ${new Date(bill.promised_due_date).toLocaleDateString()}`, 20, 42);
    }

    doc.line(20, 47, 190, 47);

    // Patient info
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(30, 41, 59);
    doc.text("PATIENT INFORMATION:", 20, 56);
    doc.setFont("helvetica", "normal");
    doc.text(`Name: ${bill.patient_name}`, 20, 62);
    doc.text(`Phone: ${bill.patient_phone}`, 20, 67);

    // Items table
    let y = 80;
    doc.setFont("helvetica", "bold");
    doc.text("Prescribed Item / Medicine", 20, y);
    doc.text("Qty", 100, y);
    doc.text("Unit (INR)", 125, y);
    doc.text("Dosage", 150, y);
    doc.text("Subtotal", 175, y);

    doc.line(20, y + 2, 190, y + 2);
    y += 10;

    doc.setFont("helvetica", "normal");
    items.forEach((item) => {
      doc.text(item.item_name, 20, y);
      doc.text(item.quantity.toString(), 102, y);
      doc.text(`Rs. ${item.unit_price.toFixed(2)}`, 125, y);
      doc.text(item.dosage || "-", 150, y);
      doc.text(`Rs. ${(item.quantity * item.unit_price).toFixed(2)}`, 175, y);
      y += 8;
    });

    doc.line(20, y, 190, y);
    y += 10;

    // Totals
    doc.setFont("helvetica", "bold");
    doc.text("Total Amount:", 120, y);
    doc.text(`Rs. ${bill.total_amount.toFixed(2)}`, 175, y);
    y += 8;

    const totalPaid = bill.total_amount - bill.remaining_amount;
    doc.text("Amount Paid:", 120, y);
    doc.text(`Rs. ${totalPaid.toFixed(2)}`, 175, y);
    y += 8;

    doc.setTextColor(239, 68, 68);
    doc.text("Outstanding Dues:", 120, y);
    doc.text(`Rs. ${bill.remaining_amount.toFixed(2)}`, 175, y);

    // Footer
    y += 20;
    doc.setFont("helvetica", "italic");
    doc.setFontSize(9);
    doc.setTextColor(148, 163, 184);
    doc.text("Thank you for visiting. Please maintain regular follow-ups.", 20, y);

    doc.save(`Invoice_${bill.patient_name.replace(/\s+/g, "_")}_${bill.id}.pdf`);
  };

  // --- SVG Charts Draw Helpers ---
  const renderHistogram = (dataPoints: DataPoint[]) => {
    if (!dataPoints || dataPoints.length === 0) return null;
    const maxVal = Math.max(...dataPoints.map(d => d.value), 1);
    const width = 500;
    const height = 200;
    const padding = 30;
    const chartW = width - padding * 2;
    const chartH = height - padding * 2;
    const colWidth = chartW / dataPoints.length;

    return (
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full text-slate-400/50">
        <defs>
          <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--chart-2)" stopOpacity="0.8" />
            <stop offset="100%" stopColor="var(--chart-2)" />
          </linearGradient>
        </defs>
        {/* Grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map((ratio, idx) => {
          const yPos = padding + chartH * (1 - ratio);
          const gridVal = Math.round(maxVal * ratio);
          return (
            <g key={idx}>
              <line x1={padding} y1={yPos} x2={width - padding} y2={yPos} stroke="currentColor" strokeOpacity="0.1" strokeDasharray="3,3" />
              <text x={padding - 5} y={yPos + 4} textAnchor="end" fontSize="9" className="fill-slate-500 dark:fill-white font-semibold">{gridVal}</text>
            </g>
          );
        })}
        {/* Bars */}
        {dataPoints.map((dp, idx) => {
          const barH = (dp.value / maxVal) * chartH;
          const x = padding + idx * colWidth + colWidth * 0.15;
          const y = height - padding - barH;
          const barW = colWidth * 0.7;

          return (
            <g key={idx} className="group cursor-pointer">
              <rect
                 x={x}
                 y={y}
                 width={barW}
                 height={Math.max(barH, 4)}
                 rx="3"
                 fill="url(#barGrad)"
                 className="transition-all duration-300 hover:opacity-80"
                 onMouseEnter={(e) => {
                   const rect = e.currentTarget.getBoundingClientRect();
                   setHoveredData({ label: dp.label, value: dp.value, x: rect.left + window.scrollX + barW / 2, y: rect.top + window.scrollY - 10 });
                 }}
                 onMouseLeave={() => setHoveredData(null)}
               />
               <text
                 x={x + barW / 2}
                 y={height - padding + 15}
                 textAnchor="middle"
                 fontSize="9"
                 className="fill-slate-500 dark:fill-white font-semibold"
               >
                 {dp.label}
               </text>
             </g>
           );
         })}
       </svg>
     );
   };
 
   const renderLineChart = (dataPoints: DataPoint[]) => {
     if (!dataPoints || dataPoints.length === 0) return null;
     const maxVal = Math.max(...dataPoints.map(d => d.value), 100);
     const width = 500;
     const height = 200;
     const padding = 35;
     const chartW = width - padding * 2;
     const chartH = height - padding * 2;
     const stepX = chartW / (dataPoints.length - 1 || 1);
 
     // Build Line Path
     let pathD = "";
     let areaD = `M ${padding} ${height - padding} `;
 
     dataPoints.forEach((dp, idx) => {
       const cx = padding + idx * stepX;
       const cy = height - padding - (dp.value / maxVal) * chartH;
       if (idx === 0) {
         pathD = `M ${cx} ${cy} `;
       } else {
         pathD += `L ${cx} ${cy} `;
       }
       areaD += `L ${cx} ${cy} `;
     });
     areaD += `L ${padding + (dataPoints.length - 1) * stepX} ${height - padding} Z`;
 
     return (
       <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full text-slate-400/50">
         <defs>
           <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
             <stop offset="0%" stopColor="var(--chart-1)" stopOpacity="0.25" />
             <stop offset="100%" stopColor="var(--chart-1)" stopOpacity="0.0" />
           </linearGradient>
         </defs>
         {/* Y Axis Grid */}
         {[0, 0.25, 0.5, 0.75, 1].map((ratio, idx) => {
           const yPos = padding + chartH * (1 - ratio);
           const gridVal = Math.round(maxVal * ratio);
           return (
             <g key={idx}>
               <line x1={padding} y1={yPos} x2={width - padding} y2={yPos} stroke="currentColor" strokeOpacity="0.1" />
               <text x={padding - 8} y={yPos + 4} textAnchor="end" fontSize="9" className="fill-slate-500 dark:fill-white font-semibold">₹{gridVal.toLocaleString("en-IN")}</text>
             </g>
           );
         })}
 
         {/* Shaded Area */}
         <path d={areaD} fill="url(#areaGrad)" />
         {/* Stroke Line */}
         <path d={pathD} fill="none" stroke="var(--chart-1)" strokeWidth="2.5" strokeLinecap="round" />
 
         {/* Data points */}
         {dataPoints.map((dp, idx) => {
           const cx = padding + idx * stepX;
           const cy = height - padding - (dp.value / maxVal) * chartH;
 
           // Only label occasional ticks on x axis if many data points
           const showLabel = dataPoints.length <= 15 || idx % 4 === 0 || idx === dataPoints.length - 1;
 
           return (
             <g key={idx} className="group">
               <circle
                 cx={cx}
                 cy={cy}
                 r="4.5"
                 fill="var(--background)"
                 stroke="var(--chart-1)"
                 strokeWidth="2"
                 className="cursor-pointer transition-all hover:r-6 hover:fill-[var(--chart-1)]"
                 onMouseEnter={(e) => {
                   const rect = e.currentTarget.getBoundingClientRect();
                   setHoveredData({ label: dp.label, value: dp.value, x: rect.left + window.scrollX, y: rect.top + window.scrollY - 10 });
                 }}
                 onMouseLeave={() => setHoveredData(null)}
               />
               {showLabel && (
                 <text x={cx} y={height - padding + 15} textAnchor="middle" fontSize="8" className="fill-slate-500 dark:fill-white font-semibold">
                   {dp.label}
                 </text>
               )}
             </g>
           );
         })}
       </svg>
     );
   };

  // --- Search Filtering ---
  const filteredPatients = patients.filter(pt =>
    pt.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    pt.phone.includes(searchQuery)
  );

  const filteredMedicines = medicines
    .filter(med => med.name.toLowerCase().includes(medSearchQuery.toLowerCase()))
    .sort((a, b) => {
      let cmp = 0;
      if (medSortBy === "name") cmp = a.name.localeCompare(b.name);
      else if (medSortBy === "stock") cmp = a.stock - b.stock;
      else if (medSortBy === "availability") {
        const avail = (s: number) => s > 10 ? 2 : s > 0 ? 1 : 0;
        cmp = avail(a.stock) - avail(b.stock);
      }
      return medSortAsc ? cmp : -cmp;
    });

  if (isAuthenticated === null) {
    return (
      <div className="min-h-screen bg-slate-100 dark:bg-slate-950 flex flex-col items-center justify-center space-y-4 text-slate-800 dark:text-slate-100">
        <div className="relative flex items-center justify-center">
          <div className="w-16 h-16 rounded-3xl bg-indigo-600 flex items-center justify-center shadow-2xl animate-pulse">
            <Activity className="w-8 h-8 text-white animate-bounce" />
          </div>
        </div>
        <div className="text-sm font-semibold tracking-wider uppercase animate-pulse">
          Loading ClinicFlow Profile...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)] font-sans antialiased">
      {/* 1. Header Toolbar */}
      <header className="border-b border-[var(--border)] bg-[var(--card)] sticky top-0 z-30 transition-all">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center shadow-md">
              <Activity className="w-5 h-5 text-white" />
            </div>
            {isEditingProfile ? (
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                <div>
                  <label className="text-[8px] font-bold uppercase text-slate-400 block mb-0.5">Clinic Name</label>
                  <input
                    type="text"
                    placeholder="Clinic Name"
                    value={editClinicName}
                    onChange={(e) => setEditClinicName(e.target.value)}
                    className="px-2.5 py-1 border border-[var(--border)] rounded-xl bg-[var(--input-bg)] text-xs font-semibold focus:ring-1 focus:ring-indigo-500 outline-none h-8 w-40"
                  />
                </div>
                <div>
                  <label className="text-[8px] font-bold uppercase text-slate-400 block mb-0.5">Doctor Name</label>
                  <input
                    type="text"
                    placeholder="Doctor Name"
                    value={editDoctorName}
                    onChange={(e) => setEditDoctorName(e.target.value)}
                    className="px-2.5 py-1 border border-[var(--border)] rounded-xl bg-[var(--input-bg)] text-xs font-semibold focus:ring-1 focus:ring-indigo-500 outline-none h-8 w-40"
                  />
                </div>
                <div className="flex items-center space-x-1 pt-4">
                  <button
                    onClick={handleUpdateProfile}
                    className="p-1.5 text-emerald-500 hover:bg-emerald-500/10 rounded-xl cursor-pointer"
                    title="Save Profile"
                  >
                    <Save className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setIsEditingProfile(false)}
                    className="p-1.5 text-red-500 hover:bg-red-500/10 rounded-xl cursor-pointer"
                    title="Cancel"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center space-x-2.5">
                <div>
                  <h1 className="text-lg font-black tracking-tight">{doctorInfo?.clinic_name || "ClinicFlow"}</h1>
                  <p className="text-[10px] font-bold text-indigo-500 dark:text-indigo-400 uppercase tracking-widest">
                    Doctor: {doctorInfo?.name}
                  </p>
                </div>
                <button
                  onClick={() => {
                    setEditClinicName(doctorInfo?.clinic_name || "");
                    setEditDoctorName(doctorInfo?.name || "");
                    setIsEditingProfile(true);
                  }}
                  className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition cursor-pointer"
                  title="Edit Profile Name"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>

          <div className="flex items-center space-x-2">
            <ThemeToggleButton
              variant="circle-blur"
              start="center"
              blur={true}
            />

            <button
              onClick={handleLogout}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl border border-red-500/20 text-red-500 hover:bg-red-500/10 text-xs font-bold transition cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Sign Out</span>
            </button>
          </div>
        </div>
      </header>

      {/* 2. Navigation Tabs */}
      <nav className="border-b border-[var(--border)] bg-[var(--nav-bg)] py-1.5 transition-all">
        <div className="max-w-7xl mx-auto px-4 flex items-center space-x-1 overflow-x-auto">
          {[
            { id: "patients", label: "Patients", icon: Users },
            { id: "appointments", label: "Appointments", icon: Calendar },
            { id: "billing", label: "Billing & Prescriptions", icon: FileText },
            { id: "medicines", label: "Pharmacy Stock", icon: BriefcaseMedical },
            { id: "analytics", label: "Analytics Dashboard", icon: Activity },
            { id: "whatsapp", label: "WhatsApp Link", icon: Smartphone }
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id as any);
                  setViewState({ type: "list" });
                }}
                className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl text-xs font-bold tracking-tight transition duration-200 cursor-pointer whitespace-nowrap ${
                  isActive
                    ? "bg-indigo-600 text-white shadow-md"
                    : "text-slate-600 dark:text-slate-400 hover:bg-[var(--card-hover)] hover:text-[var(--foreground)]"
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* 3. Main Dashboard Panels */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {toast && (
          <div
            className={`fixed bottom-4 right-4 z-50 flex items-center space-x-2 px-4 py-3 rounded-2xl shadow-xl border ${
              toast.type === "success"
                ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-500"
                : "bg-red-500/10 border-red-500/20 text-red-500"
            }`}
          >
            {toast.type === "success" ? <CheckCircle2 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
            <span className="text-xs font-semibold">{toast.message}</span>
          </div>
        )}

        {/* HOVER TOOLTIP ELEMENT FOR SVG CHARTS */}
        {hoveredData && (
          <div
            style={{ left: hoveredData.x, top: hoveredData.y }}
            className="absolute -translate-x-1/2 -translate-y-full z-50 pointer-events-none bg-slate-900 text-white text-[10px] font-bold px-2 py-1 rounded shadow-md border border-slate-700 whitespace-nowrap"
          >
            {hoveredData.label}: {hoveredData.value}
          </div>
        )}

        {/* VIEW: List vs Detail */}
        {viewState.type === "list" ? (
          <div>
            {/* TABS INNER PAGES */}

            {/* TAB: PATIENTS */}
            {activeTab === "patients" && (
              <div className="space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="relative flex-grow max-w-md">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Search patient by name or phone..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full pl-9 pr-4 py-2 border border-[var(--border)] rounded-2xl bg-[var(--input-bg)] focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm transition-all"
                    />
                  </div>
                  <FloatingPanelRoot isOpen={isAddPatientOpen} onOpenChange={setIsAddPatientOpen}>
                    <FloatingPanelTrigger
                      title="Register New Patient"
                      className="flex items-center justify-center space-x-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-2xl text-xs shadow-md transition cursor-pointer border-none"
                    >
                      <Plus className="w-4 h-4 mr-1.5" />
                      <span>Register Patient</span>
                    </FloatingPanelTrigger>
                    <FloatingPanelContent className="w-80 sm:w-96 text-left">
                      <FloatingPanelBody>
                        <form onSubmit={handleAddPatient} className="space-y-3.5 text-xs text-[var(--foreground)]">
                          <div>
                            <label className="text-[10px] font-bold uppercase text-slate-400">Full Name</label>
                            <input
                              type="text"
                              required
                              value={newPtName}
                              onChange={(e) => setNewPtName(e.target.value)}
                              className="w-full mt-1 px-4 py-2 border border-[var(--border)] rounded-2xl bg-[var(--input-bg)] text-xs focus:ring-2 focus:ring-indigo-500 outline-none"
                            />
                          </div>

                          <div>
                            <label className="text-[10px] font-bold uppercase text-slate-400">Phone Number (with Country Code)</label>
                            <input
                              type="text"
                              required
                              placeholder="e.g. +919999999999"
                              value={newPtPhone}
                              onChange={(e) => setNewPtPhone(e.target.value)}
                              className="w-full mt-1 px-4 py-2 border border-[var(--border)] rounded-2xl bg-[var(--input-bg)] text-xs focus:ring-2 focus:ring-indigo-500 outline-none"
                            />
                          </div>

                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <label className="text-[10px] font-bold uppercase text-slate-400">Age</label>
                              <input
                                type="number"
                                value={newPtAge}
                                onChange={(e) => setNewPtAge(e.target.value)}
                                className="w-full mt-1 px-4 py-2 border border-[var(--border)] rounded-2xl bg-[var(--input-bg)] text-xs focus:ring-2 focus:ring-indigo-500 outline-none"
                              />
                            </div>
                            <div>
                              <label className="text-[10px] font-bold uppercase text-slate-400">Gender</label>
                              <select
                                value={newPtGender}
                                onChange={(e) => setNewPtGender(e.target.value)}
                                className="w-full mt-1 px-4 py-2 border border-[var(--border)] rounded-2xl bg-[var(--input-bg)] text-xs focus:ring-2 focus:ring-indigo-500 outline-none"
                              >
                                <option>Male</option>
                                <option>Female</option>
                                <option>Other</option>
                              </select>
                            </div>
                          </div>

                          <div>
                            <label className="text-[10px] font-bold uppercase text-slate-400">Medical History Summary</label>
                            <textarea
                              placeholder="Allergies, chronic illness, major surgeries..."
                              value={newPtHistory}
                              onChange={(e) => setNewPtHistory(e.target.value)}
                              rows={3}
                              className="w-full mt-1 px-4 py-2 border border-[var(--border)] rounded-2xl bg-[var(--input-bg)] text-xs focus:ring-2 focus:ring-indigo-500 outline-none resize-none"
                            />
                          </div>

                          <div className="flex space-x-2 pt-2 text-xs">
                            <FloatingPanelCloseButton className="w-1/2 py-2.5 rounded-2xl border border-[var(--border)] font-bold text-slate-500 hover:bg-[var(--card-hover)] transition cursor-pointer justify-center" />
                            <FloatingPanelSubmitButton
                              label="Register"
                              className="w-1/2 py-2.5 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold shadow-md transition cursor-pointer ml-0 h-auto justify-center"
                            />
                          </div>
                        </form>
                      </FloatingPanelBody>
                    </FloatingPanelContent>
                  </FloatingPanelRoot>
                </div>

                <div className="bg-[var(--card)] border border-[var(--border)] rounded-3xl overflow-hidden transition-all shadow-sm">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-[var(--border)] bg-[var(--nav-bg)] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider">
                          <th className="px-6 py-4">Patient Name</th>
                          <th className="px-6 py-4">Phone</th>
                          <th className="px-6 py-4">Age / Gender</th>
                          <th className="px-6 py-4">Medical History Summary</th>
                          <th className="px-6 py-4 text-right">Outstanding Dues</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredPatients.length > 0 ? (
                          filteredPatients.map((pt) => (
                            <tr
                              key={pt.id}
                              onClick={() => setViewState({ type: "patient", patientId: pt.id })}
                              className="border-b border-[var(--border)] hover:bg-[var(--card-hover)] transition cursor-pointer"
                            >
                              <td className="px-6 py-4 font-black text-sm">{pt.name}</td>
                              <td className="px-6 py-4 text-slate-500 dark:text-slate-400 font-medium">{pt.phone}</td>
                              <td className="px-6 py-4 text-slate-500 dark:text-slate-400 font-medium">{pt.age} yrs / {pt.gender}</td>
                              <td className="px-6 py-4 text-slate-400 truncate max-w-xs">{pt.medical_history || "No logs"}</td>
                              <td className="px-6 py-4 text-right font-black text-red-500">
                                {pt.total_dues > 0 ? `₹${pt.total_dues.toLocaleString("en-IN")}` : "Settled"}
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={5} className="px-6 py-12 text-center text-slate-400 font-semibold">
                              No patients found. Click 'Register Patient' to add one.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* TAB: APPOINTMENTS */}
            {activeTab === "appointments" && (
              <div className="space-y-6">
                <div className="flex justify-between items-center">
                  <h2 className="text-xl font-black">Agenda Log</h2>
                  <FloatingPanelRoot isOpen={isAddAppointmentOpen} onOpenChange={setIsAddAppointmentOpen}>
                    <FloatingPanelTrigger
                      title="Book Appointment"
                      className="flex items-center space-x-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-2xl text-xs shadow-md transition cursor-pointer border-none"
                    >
                      <Plus className="w-4 h-4 mr-1.5" />
                      <span>Book Appointment</span>
                    </FloatingPanelTrigger>
                    <FloatingPanelContent className="w-80 sm:w-96 text-left">
                      <FloatingPanelBody>
                        <form onSubmit={handleAddAppointment} className="space-y-4 text-xs text-[var(--foreground)]">
                          <div>
                            <label className="text-[10px] font-bold uppercase text-slate-400">Select Patient</label>
                            <select
                              required
                              value={apptPatientId}
                              onChange={(e) => setApptPatientId(e.target.value)}
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

                          <div>
                            <label className="text-[10px] font-bold uppercase text-slate-400">Schedule Date & Time</label>
                            <input
                              type="datetime-local"
                              required
                              value={apptDate}
                              onChange={(e) => setApptDate(e.target.value)}
                              className="w-full mt-1 px-4 py-2 border border-[var(--border)] rounded-2xl bg-[var(--input-bg)] text-xs focus:ring-2 focus:ring-indigo-500 outline-none"
                            />
                          </div>

                          <div>
                            <label className="text-[10px] font-bold uppercase text-slate-400">Consultation Reason / Notes</label>
                            <input
                              type="text"
                              placeholder="e.g. Regular health check, chest pain"
                              value={apptReason}
                              onChange={(e) => setApptReason(e.target.value)}
                              className="w-full mt-1 px-4 py-2 border border-[var(--border)] rounded-2xl bg-[var(--input-bg)] text-xs focus:ring-2 focus:ring-indigo-500 outline-none"
                            />
                          </div>

                          <div className="flex space-x-2 pt-2 text-xs">
                            <FloatingPanelCloseButton className="w-1/2 py-2.5 rounded-2xl border border-[var(--border)] font-bold text-slate-500 hover:bg-[var(--card-hover)] transition cursor-pointer justify-center" />
                            <FloatingPanelSubmitButton
                              label="Book Slot"
                              className="w-1/2 py-2.5 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold shadow-md transition cursor-pointer ml-0 h-auto justify-center"
                            />
                          </div>
                        </form>
                      </FloatingPanelBody>
                    </FloatingPanelContent>
                  </FloatingPanelRoot>
                </div>

                <div className="bg-[var(--card)] border border-[var(--border)] rounded-3xl overflow-hidden transition-all shadow-sm">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-[var(--border)] bg-[var(--nav-bg)] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider">
                          <th className="px-6 py-4">Slot Date & Time</th>
                          <th className="px-6 py-4">Patient Name</th>
                          <th className="px-6 py-4">Reason / Notes</th>
                          <th className="px-6 py-4">Status</th>
                          <th className="px-6 py-4 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {appointments.length > 0 ? (
                          appointments.map((ap) => (
                            <tr key={ap.id} className="border-b border-[var(--border)] hover:bg-[var(--card-hover)] transition">
                              <td className="px-6 py-4 font-bold text-slate-500 dark:text-slate-400">
                                {new Date(ap.appointment_date).toLocaleString()}
                              </td>
                              <td className="px-6 py-4 font-black text-sm">{ap.patient_name}</td>
                              <td className="px-6 py-4 text-slate-400">{ap.reason || "General Consult"}</td>
                              <td className="px-6 py-4">
                                <span
                                  className={`inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                                    ap.status === "COMPLETED"
                                      ? "bg-emerald-500/10 text-emerald-500"
                                      : ap.status === "CANCELLED"
                                      ? "bg-red-500/10 text-red-500"
                                      : "bg-amber-500/10 text-amber-500"
                                  }`}
                                >
                                  {ap.status === "COMPLETED" ? (
                                    <CheckCircle2 className="w-3 h-3" />
                                  ) : ap.status === "CANCELLED" ? (
                                    <XCircle className="w-3 h-3" />
                                  ) : (
                                    <Clock className="w-3 h-3" />
                                  )}
                                  <span>{ap.status}</span>
                                </span>
                              </td>
                              <td className="px-6 py-4 text-right">
                                {ap.status !== "CANCELLED" && (
                                  <button
                                    onClick={() => toggleAppointmentStatus(ap.id, ap.status)}
                                    className={`px-3 py-1 rounded-xl text-[10px] font-bold border transition cursor-pointer ${
                                      ap.status === "COMPLETED"
                                        ? "border-amber-500/20 text-amber-500 hover:bg-amber-500/10"
                                        : "border-emerald-500/20 text-emerald-500 hover:bg-emerald-500/10"
                                    }`}
                                  >
                                    {ap.status === "COMPLETED" ? "Mark Pending" : "Mark Completed"}
                                  </button>
                                )}
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={5} className="px-6 py-12 text-center text-slate-400 font-semibold">
                              No appointments booked. Click 'Book Appointment' to schedule one.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* TAB: BILLING & PRESCRIPTIONS */}
            {activeTab === "billing" && (
              <div className="space-y-6">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                  <h2 className="text-xl font-black">Clinic Billings</h2>
                  <FloatingPanelRoot isOpen={isCreateBillOpen} onOpenChange={setIsCreateBillOpen}>
                    <FloatingPanelTrigger
                      title="Generate Bill & Prescription"
                      className="flex items-center space-x-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-2xl text-xs shadow-md transition cursor-pointer self-stretch sm:self-auto justify-center border-none"
                    >
                      <Plus className="w-4 h-4 mr-1.5" />
                      <span>Compose Bill & Prescription</span>
                    </FloatingPanelTrigger>
                    <FloatingPanelContent className="w-80 sm:w-[32rem] max-h-[80vh] overflow-y-auto text-left">
                      <FloatingPanelBody>
                        <form onSubmit={handleCreateBill} className="space-y-4 text-xs text-[var(--foreground)]">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                              <label className="text-[10px] font-bold uppercase text-slate-400">Select Patient</label>
                              <select
                                required
                                value={billPatientId}
                                onChange={(e) => setBillPatientId(e.target.value)}
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
                            <div>
                              <label className="text-[10px] font-bold uppercase text-slate-400">Diagnosis / Bill Name</label>
                              <input
                                type="text"
                                required
                                placeholder="e.g. Dental cleaning, Viral fever"
                                value={billDesc}
                                onChange={(e) => setBillDesc(e.target.value)}
                                className="w-full mt-1 px-4 py-2 border border-[var(--border)] rounded-2xl bg-[var(--input-bg)] text-xs focus:ring-2 focus:ring-indigo-500 outline-none"
                              />
                            </div>
                          </div>

                          {/* Multiple Items Composer */}
                          <div className="space-y-3">
                            <div className="flex justify-between items-center">
                              <span className="text-[10px] font-bold uppercase text-slate-400">Bill Items / Medicines</span>
                              <button
                                type="button"
                                onClick={addBillItemRow}
                                className="flex items-center space-x-1.5 text-indigo-500 hover:text-indigo-600 text-[10px] font-bold cursor-pointer"
                              >
                                <PlusCircle className="w-3.5 h-3.5" />
                                <span>Add Item</span>
                              </button>
                            </div>

                            <div className="space-y-2.5 max-h-48 overflow-y-auto pr-1">
                              {billItems.map((item, idx) => (
                                <div key={idx} className="flex flex-col sm:flex-row gap-2.5 items-end sm:items-center bg-[var(--nav-bg)] p-3 rounded-2xl border border-[var(--border)]">
                                  <div className="w-full sm:flex-1 relative">
                                    <label className="text-[8px] font-bold uppercase text-slate-400">Item Name</label>
                                    <input
                                      type="text"
                                      required
                                      placeholder="Medicine name or Consultation Fee"
                                      value={item.item_name}
                                      onChange={(e) => handleBillItemChange(idx, "item_name", e.target.value)}
                                      onFocus={() => setFocusedMedIndex(idx)}
                                      onBlur={() => {
                                        // Delay slightly to let standard click / mousedown on dropdown run
                                        setTimeout(() => {
                                          setFocusedMedIndex(null);
                                        }, 200);
                                      }}
                                      className="w-full mt-0.5 px-3 py-1.5 border border-[var(--border)] rounded-xl bg-[var(--input-bg)] text-xs outline-none"
                                    />
                                    {focusedMedIndex === idx && item.item_name.trim().length > 0 && (() => {
                                      const query = item.item_name.toLowerCase();
                                      const matches = medicines.filter(m => m.name.toLowerCase().includes(query)).slice(0, 5);
                                      if (matches.length === 0) return null;
                                      return (
                                        <div className="absolute left-0 right-0 z-50 mt-1 max-h-40 overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-lg divide-y divide-[var(--border)]">
                                          {matches.map((med) => (
                                            <div
                                              key={med.id}
                                              onMouseDown={(e) => {
                                                e.preventDefault(); // Prevents immediate input blur
                                                const updated = [...billItems];
                                                updated[idx].item_name = med.name;
                                                updated[idx].unit_price = med.price;
                                                setBillItems(updated);
                                                setFocusedMedIndex(null);
                                              }}
                                              className="px-3 py-2 text-xs hover:bg-[var(--card-hover)] cursor-pointer flex justify-between items-center transition-colors duration-150"
                                            >
                                              <span className="font-semibold text-[var(--foreground)]">{med.name}</span>
                                              <div className="flex items-center space-x-2 text-[10px] text-slate-400">
                                                <span className="font-bold text-indigo-500">₹{med.price.toFixed(2)}</span>
                                                <span>•</span>
                                                <span className={med.stock > 0 ? "text-emerald-500 font-medium" : "text-red-500 font-medium"}>
                                                  {med.stock > 0 ? `Stock: ${med.stock}` : "Out of stock"}
                                                </span>
                                              </div>
                                            </div>
                                          ))}
                                        </div>
                                      );
                                    })()}
                                  </div>
                                  <div className="w-20">
                                    <label className="text-[8px] font-bold uppercase text-slate-400">Qty</label>
                                    <input
                                      type="number"
                                      required
                                      value={item.quantity}
                                      onChange={(e) => handleBillItemChange(idx, "quantity", e.target.value)}
                                      className="w-full mt-0.5 px-3 py-1.5 border border-[var(--border)] rounded-xl bg-[var(--input-bg)] text-xs outline-none"
                                    />
                                  </div>
                                  <div className="w-24">
                                    <label className="text-[8px] font-bold uppercase text-slate-400">Price (INR)</label>
                                    <input
                                      type="number"
                                      step="0.01"
                                      required
                                      value={item.unit_price || ""}
                                      onChange={(e) => handleBillItemChange(idx, "unit_price", e.target.value)}
                                      className="w-full mt-0.5 px-3 py-1.5 border border-[var(--border)] rounded-xl bg-[var(--input-bg)] text-xs outline-none"
                                    />
                                  </div>
                                  <div className="w-28">
                                    <label className="text-[8px] font-bold uppercase text-slate-400">Dosage</label>
                                    <input
                                      type="text"
                                      placeholder="e.g. 1-0-1"
                                      value={item.dosage}
                                      onChange={(e) => handleBillItemChange(idx, "dosage", e.target.value)}
                                      className="w-full mt-0.5 px-3 py-1.5 border border-[var(--border)] rounded-xl bg-[var(--input-bg)] text-xs outline-none"
                                    />
                                  </div>
                                  {billItems.length > 1 && (
                                    <button
                                      type="button"
                                      onClick={() => removeBillItemRow(idx)}
                                      className="p-1.5 text-red-500 hover:bg-red-500/10 rounded-lg cursor-pointer"
                                    >
                                      <MinusCircle className="w-4 h-4" />
                                    </button>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* Total Display */}
                          <div className="flex justify-between items-center bg-indigo-500/10 p-3 rounded-2xl text-xs font-bold text-indigo-500">
                            <span>Calculated Total:</span>
                            <span className="text-sm font-black">₹{getBillTotal().toFixed(2)}</span>
                          </div>

                          {/* Upfront payment details */}
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 border-t border-[var(--border)] pt-4">
                            <div>
                              <label className="text-[10px] font-bold uppercase text-slate-400">Upfront Amount Paid</label>
                              <input
                                type="number"
                                step="0.01"
                                placeholder="Keep blank for 0"
                                value={billAmountPaid}
                                onChange={(e) => setBillAmountPaid(e.target.value)}
                                className="w-full mt-1 px-4 py-2 border border-[var(--border)] rounded-2xl bg-[var(--input-bg)] text-xs focus:ring-2 focus:ring-indigo-500 outline-none"
                              />
                            </div>
                            <div>
                              <label className="text-[10px] font-bold uppercase text-slate-400">Payment Mode</label>
                              <select
                                value={billPayMode}
                                onChange={(e) => setBillPayMode(e.target.value as any)}
                                className="w-full mt-1 px-4 py-2 border border-[var(--border)] rounded-2xl bg-[var(--input-bg)] text-xs focus:ring-2 focus:ring-indigo-500 outline-none"
                              >
                                <option>CASH</option>
                                <option>ONLINE_UPI</option>
                                <option>BANK_TRANSFER</option>
                              </select>
                            </div>
                            <div>
                              <label className="text-[10px] font-bold uppercase text-slate-400">Promise Due Date</label>
                              <input
                                type="date"
                                value={billDueDate}
                                onChange={(e) => setBillDueDate(e.target.value)}
                                className="w-full mt-1 px-4 py-2 border border-[var(--border)] rounded-2xl bg-[var(--input-bg)] text-xs focus:ring-2 focus:ring-indigo-500 outline-none"
                              />
                            </div>
                          </div>

                          {/* Upfront Payment Remarks & File attachment */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                              <label className="text-[10px] font-bold uppercase text-slate-400">Remarks / Log Note</label>
                              <input
                                type="text"
                                placeholder="Remarks"
                                value={billPayRemarks}
                                onChange={(e) => setBillPayRemarks(e.target.value)}
                                className="w-full mt-1 px-4 py-2 border border-[var(--border)] rounded-2xl bg-[var(--input-bg)] text-xs focus:ring-2 focus:ring-indigo-500 outline-none"
                              />
                            </div>
                            <div>
                              <label className="text-[10px] font-bold uppercase text-slate-400">Upload Receipt Slip (Image/PDF)</label>
                              <input
                                type="file"
                                accept="image/*,application/pdf"
                                onChange={(e) => setBillFile(e.target.files?.[0] || null)}
                                className="w-full mt-1 text-xs text-slate-500 file:mr-4 file:py-1.5 file:px-3 file:rounded-xl file:border-0 file:text-[10px] file:font-semibold file:bg-indigo-500/10 file:text-indigo-500 hover:file:bg-indigo-500/20"
                              />
                            </div>
                          </div>

                          <div className="flex space-x-2 pt-2 text-xs">
                            <FloatingPanelCloseButton className="w-1/2 py-2.5 rounded-2xl border border-[var(--border)] font-bold text-slate-500 hover:bg-[var(--card-hover)] transition cursor-pointer justify-center" />
                            <FloatingPanelSubmitButton
                              label="Generate Invoice"
                              className="w-1/2 py-2.5 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold shadow-md transition cursor-pointer ml-0 h-auto justify-center"
                            />
                          </div>
                        </form>
                      </FloatingPanelBody>
                    </FloatingPanelContent>
                  </FloatingPanelRoot>
                </div>

                {/* Search Bar */}
                <div className="relative w-full md:max-w-xs">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search bills by patient name..."
                    value={billSearchQuery}
                    onChange={(e) => {
                      setBillSearchQuery(e.target.value);
                      loadRecentBills(e.target.value, 0);
                    }}
                    className="w-full pl-10 pr-4 py-2 bg-[var(--card)] border border-[var(--border)] rounded-2xl text-xs focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>

                <div className="bg-[var(--card)] border border(--border) rounded-3xl overflow-hidden transition-all shadow-sm">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-[var(--border)] bg-[var(--nav-bg)] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider">
                          <th className="px-6 py-4">Date</th>
                          <th className="px-6 py-4">Patient Name</th>
                          <th className="px-6 py-4">Diagnosis / Details</th>
                          <th className="px-6 py-4">Total Amount</th>
                          <th className="px-6 py-4">Outstanding Balance</th>
                          <th className="px-6 py-4">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {recentBills.length > 0 ? (
                          recentBills.map((bill) => (
                            <tr
                              key={bill.id}
                              onClick={() => setViewState({ type: "bill", billId: bill.id })}
                              className="border-b border-[var(--border)] hover:bg-[var(--card-hover)] transition cursor-pointer"
                            >
                              <td className="px-6 py-4 font-semibold text-slate-500 dark:text-slate-400">
                                {new Date(bill.created_at).toLocaleDateString()}
                              </td>
                              <td className="px-6 py-4 font-black">{bill.patient_name}</td>
                              <td className="px-6 py-4 text-slate-400 max-w-xs truncate">{bill.description}</td>
                              <td className="px-6 py-4 font-bold text-slate-700 dark:text-slate-300">
                                ₹{bill.total_amount.toFixed(2)}
                              </td>
                              <td className="px-6 py-4 font-black text-red-500">
                                ₹{bill.remaining_amount.toFixed(2)}
                              </td>
                              <td className="px-6 py-4">
                                <span
                                  className={`inline-block px-2.5 py-0.5 rounded-full text-[9px] font-bold ${
                                    bill.status === "SETTLED"
                                      ? "bg-emerald-500/10 text-emerald-500"
                                      : bill.status === "PARTIALLY_PAID"
                                      ? "bg-amber-500/10 text-amber-500"
                                      : "bg-red-500/10 text-red-500"
                                  }`}
                                >
                                  {bill.status}
                                </span>
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={6} className="px-6 py-12 text-center text-slate-400 font-semibold">
                              {billsLoading ? "Loading bills..." : "No billing records found."}
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Pagination */}
                {recentBills.length < billsTotalCount && (
                  <div className="flex justify-center pt-2">
                    <button
                      onClick={() => loadRecentBills(billSearchQuery, billsOffset + 20, true)}
                      disabled={billsLoading}
                      className="px-6 py-2 border border-indigo-600/30 text-indigo-500 hover:bg-indigo-500/10 font-bold rounded-2xl text-xs transition cursor-pointer flex items-center space-x-1.5"
                    >
                      {billsLoading ? (
                        <span>Loading...</span>
                      ) : (
                        <>
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span>Load More Bills</span>
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* TAB: PHARMACY STOCK */}
            {activeTab === "medicines" && (
              <div className="space-y-6">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                  <h2 className="text-xl font-black">Medicine Catalog</h2>
                  <FloatingPanelRoot isOpen={isAddMedicineOpen} onOpenChange={setIsAddMedicineOpen}>
                    <FloatingPanelTrigger
                      title="Register New Medicine"
                      className="flex items-center space-x-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-2xl text-xs shadow-md transition cursor-pointer self-stretch sm:self-auto justify-center border-none"
                    >
                      <Plus className="w-4 h-4 mr-1.5" />
                      <span>Add New Medicine</span>
                    </FloatingPanelTrigger>
                    <FloatingPanelContent className="w-80 sm:w-96 text-left">
                      <FloatingPanelBody>
                        <form onSubmit={handleAddMedicine} className="space-y-4 text-xs text-[var(--foreground)]">
                          <div>
                            <label className="text-[10px] font-bold uppercase text-slate-400">Medicine Name</label>
                            <input
                              type="text"
                              required
                              value={medName}
                              onChange={(e) => setMedName(e.target.value)}
                              className="w-full mt-1 px-4 py-2 border border-[var(--border)] rounded-2xl bg-[var(--input-bg)] text-xs focus:ring-2 focus:ring-indigo-500 outline-none"
                            />
                          </div>

                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <label className="text-[10px] font-bold uppercase text-slate-400">Price Per Unit</label>
                              <input
                                type="number"
                                step="0.01"
                                required
                                value={medPrice}
                                onChange={(e) => setMedPrice(e.target.value)}
                                className="w-full mt-1 px-4 py-2 border border-[var(--border)] rounded-2xl bg-[var(--input-bg)] text-xs focus:ring-2 focus:ring-indigo-500 outline-none"
                              />
                            </div>
                            <div>
                              <label className="text-[10px] font-bold uppercase text-slate-400">Initial Stock</label>
                              <input
                                type="number"
                                value={medStock}
                                onChange={(e) => setMedStock(e.target.value)}
                                className="w-full mt-1 px-4 py-2 border border-[var(--border)] rounded-2xl bg-[var(--input-bg)] text-xs focus:ring-2 focus:ring-indigo-500 outline-none"
                              />
                            </div>
                          </div>

                          <div className="flex space-x-2 pt-2 text-xs">
                            <FloatingPanelCloseButton className="w-1/2 py-2.5 rounded-2xl border border-[var(--border)] font-bold text-slate-500 hover:bg-[var(--card-hover)] transition cursor-pointer justify-center" />
                            <FloatingPanelSubmitButton
                              label="Register"
                              className="w-1/2 py-2.5 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold shadow-md transition cursor-pointer ml-0 h-auto justify-center"
                            />
                          </div>
                        </form>
                      </FloatingPanelBody>
                    </FloatingPanelContent>
                  </FloatingPanelRoot>
                </div>

                {/* Filters & Search */}
                <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
                  {/* Search Bar */}
                  <div className="relative w-full md:max-w-xs">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Search medicine catalog..."
                      value={medSearchQuery}
                      onChange={(e) => setMedSearchQuery(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 bg-[var(--card)] border border-[var(--border)] rounded-2xl text-xs focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                  </div>

                  {/* Sort Controls */}
                  <div className="flex items-center space-x-2 w-full md:w-auto overflow-x-auto py-1">
                    <span className="text-[10px] font-bold uppercase text-slate-400 whitespace-nowrap">Sort By:</span>
                    {(["name", "stock", "availability"] as const).map((field) => (
                      <button
                        key={field}
                        onClick={() => {
                          if (medSortBy === field) {
                            setMedSortAsc(!medSortAsc);
                          } else {
                            setMedSortBy(field);
                            setMedSortAsc(true);
                          }
                        }}
                        className={`px-3 py-1.5 rounded-xl border text-[10px] font-bold capitalize transition flex items-center space-x-1.5 cursor-pointer whitespace-nowrap ${
                          medSortBy === field
                            ? "bg-indigo-500/10 border-indigo-500/30 text-indigo-500"
                            : "border-[var(--border)] hover:bg-[var(--card-hover)] text-slate-500"
                        }`}
                      >
                        <span>{field}</span>
                        {medSortBy === field && (
                          <ArrowUpDown className={`w-3 h-3 transition-transform ${medSortAsc ? "" : "rotate-180"}`} />
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="bg-[var(--card)] border border-[var(--border)] rounded-3xl overflow-hidden transition-all shadow-sm">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-[var(--border)] bg-[var(--nav-bg)] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider">
                          <th className="px-6 py-4">Medicine Name</th>
                          <th className="px-6 py-4">Unit Price</th>
                          <th className="px-6 py-4">Stock In-Hand</th>
                          <th className="px-6 py-4">Status</th>
                          <th className="px-6 py-4 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredMedicines.length > 0 ? (
                          filteredMedicines.map((med) => {
                            const isEditing = editingMedId === med.id;
                            return (
                              <tr key={med.id} className="border-b border-[var(--border)] hover:bg-[var(--card-hover)] transition">
                                <td className="px-6 py-4 font-black text-sm">
                                  {isEditing ? (
                                    <input
                                      type="text"
                                      value={editMedName}
                                      onChange={(e) => setEditMedName(e.target.value)}
                                      className="px-2.5 py-1 border border-[var(--border)] rounded-xl bg-[var(--input-bg)] text-xs font-semibold focus:ring-1 focus:ring-indigo-500 outline-none w-full max-w-[200px]"
                                    />
                                  ) : (
                                    med.name
                                  )}
                                </td>
                                <td className="px-6 py-4 font-bold text-slate-500 dark:text-slate-400">
                                  {isEditing ? (
                                    <div className="flex items-center space-x-1">
                                      <span className="text-slate-400">₹</span>
                                      <input
                                        type="number"
                                        step="0.01"
                                        value={editMedPrice}
                                        onChange={(e) => setEditMedPrice(e.target.value)}
                                        className="px-2.5 py-1 border border-[var(--border)] rounded-xl bg-[var(--input-bg)] text-xs font-semibold focus:ring-1 focus:ring-indigo-500 outline-none w-20"
                                      />
                                    </div>
                                  ) : (
                                    `₹${med.price.toFixed(2)}`
                                  )}
                                </td>
                                <td className="px-6 py-4 font-bold text-slate-500 dark:text-slate-400">
                                  {isEditing ? (
                                    <input
                                      type="number"
                                      value={editMedStock}
                                      onChange={(e) => setEditMedStock(e.target.value)}
                                      className="px-2.5 py-1 border border-[var(--border)] rounded-xl bg-[var(--input-bg)] text-xs font-semibold focus:ring-1 focus:ring-indigo-500 outline-none w-20"
                                    />
                                  ) : (
                                    `${med.stock} units`
                                  )}
                                </td>
                                <td className="px-6 py-4">
                                  <span
                                    className={`inline-flex px-2 py-0.5 rounded-full text-[9px] font-bold ${
                                      med.stock > 10
                                        ? "bg-emerald-500/10 text-emerald-500"
                                        : med.stock > 0
                                        ? "bg-amber-500/10 text-amber-500"
                                        : "bg-red-500/10 text-red-500"
                                    }`}
                                  >
                                    {med.stock > 10 ? "Available" : med.stock > 0 ? "Low Stock" : "Out of stock"}
                                  </span>
                                </td>
                                <td className="px-6 py-4 text-right">
                                  {isEditing ? (
                                    <div className="flex items-center justify-end space-x-2">
                                      <button
                                        onClick={() => handleUpdateMedicine(med.id)}
                                        className="p-1.5 text-emerald-500 hover:bg-emerald-500/10 rounded-xl cursor-pointer"
                                        title="Save Changes"
                                      >
                                        <Save className="w-4 h-4" />
                                      </button>
                                      <button
                                        onClick={() => setEditingMedId(null)}
                                        className="p-1.5 text-red-500 hover:bg-red-500/10 rounded-xl cursor-pointer"
                                        title="Cancel"
                                      >
                                        <X className="w-4 h-4" />
                                      </button>
                                    </div>
                                  ) : (
                                    <div className="flex items-center justify-end space-x-2">
                                      <button
                                        onClick={() => {
                                          setEditingMedId(med.id);
                                          setEditMedName(med.name);
                                          setEditMedPrice(med.price.toString());
                                          setEditMedStock(med.stock.toString());
                                        }}
                                        className="p-1.5 text-slate-500 hover:bg-slate-500/10 dark:text-slate-400 rounded-xl cursor-pointer"
                                        title="Edit Medicine"
                                      >
                                        <Pencil className="w-4 h-4" />
                                      </button>
                                      <button
                                        onClick={() => handleDeleteMedicine(med.id, med.name)}
                                        className="p-1.5 text-red-500 hover:bg-red-500/10 rounded-xl cursor-pointer"
                                        title="Delete Medicine"
                                      >
                                        <Trash2 className="w-4 h-4" />
                                      </button>
                                    </div>
                                  )}
                                </td>
                              </tr>
                            );
                          })
                        ) : (
                          <tr>
                            <td colSpan={5} className="px-6 py-12 text-center text-slate-400 font-semibold">
                              {medSearchQuery ? "No medicines matching your search." : "Pharmacy inventory is empty. Click 'Add New Medicine' to register stock."}
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* TAB: ANALYTICS DASHBOARD */}
            {activeTab === "analytics" && (
              <div className="space-y-8">
                {/* 1. Summary Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                  <div className="bg-[var(--card)] border border-[var(--border)] rounded-3xl p-6 shadow-sm flex items-center justify-between">
                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Total Patients Treated</span>
                      <h3 className="text-3xl font-black mt-1">
                        {analytics?.patients_weekly?.reduce((s, p) => s + p.value, 0) || 0}
                      </h3>
                      <p className="text-[10px] text-indigo-500 font-semibold mt-1">Completed slots (past 7 days)</p>
                    </div>
                    <div className="p-3.5 bg-indigo-500/10 text-indigo-500 rounded-2xl">
                      <Users className="w-6 h-6" />
                    </div>
                  </div>

                  <div className="bg-[var(--card)] border border-[var(--border)] rounded-3xl p-6 shadow-sm flex items-center justify-between">
                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Revenue (Past 30 Days)</span>
                      <h3 className="text-3xl font-black mt-1 text-emerald-500">
                        ₹{(analytics?.revenue_daily?.reduce((s, r) => s + r.value, 0) || 0).toLocaleString("en-IN")}
                      </h3>
                      <p className="text-[10px] text-emerald-500 font-semibold mt-1">Gross Invoiced</p>
                    </div>
                    <div className="p-3.5 bg-emerald-500/10 text-emerald-500 rounded-2xl">
                      <DollarSign className="w-6 h-6" />
                    </div>
                  </div>

                  <div className="bg-[var(--card)] border border-[var(--border)] rounded-3xl p-6 shadow-sm flex items-center justify-between">
                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Upcoming Agenda Slots</span>
                      <h3 className="text-3xl font-black mt-1 text-amber-500">
                        {analytics?.appointments_future?.reduce((s, a) => s + a.value, 0) || 0}
                      </h3>
                      <p className="text-[10px] text-amber-500 font-semibold mt-1">Next 14 Days</p>
                    </div>
                    <div className="p-3.5 bg-amber-500/10 text-amber-500 rounded-2xl">
                      <Calendar className="w-6 h-6" />
                    </div>
                  </div>
                </div>

                {/* 2. Graphs Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Treated Patients Histogram */}
                  <div className="bg-white border border-[var(--border)] dark:bg-zinc-900 dark:border-zinc-800 rounded-3xl p-6 shadow-sm space-y-4 text-[var(--foreground)] dark:text-white">
                    <div className="flex justify-between items-center">
                      <div>
                        <h4 className="text-sm font-black text-[var(--foreground)] dark:text-white">Patients Treated (Completed)</h4>
                        <p className="text-[10px] text-[var(--text-muted)] dark:text-zinc-400">Historical performance data</p>
                      </div>
                      <div className="flex border border-[var(--border)] dark:border-zinc-800 rounded-xl overflow-hidden text-[10px] font-bold">
                        {(["weekly", "monthly", "yearly"] as const).map((t) => (
                          <button
                            key={t}
                            onClick={() => setPatientTimeframe(t)}
                            className={`px-3 py-1.5 cursor-pointer uppercase transition ${
                              patientTimeframe === t
                                ? "bg-indigo-600 text-white"
                                : "hover:bg-[var(--card-hover)] text-[var(--text-muted)] dark:text-zinc-400 dark:hover:bg-zinc-800"
                            }`}
                          >
                            {t}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="h-64 flex items-center justify-center p-2">
                      {analytics ? (
                        patientTimeframe === "weekly" ? (
                          renderHistogram(analytics.patients_weekly)
                        ) : patientTimeframe === "monthly" ? (
                          renderHistogram(analytics.patients_monthly)
                        ) : (
                          renderHistogram(analytics.patients_yearly)
                        )
                      ) : (
                        <div className="text-xs text-[var(--text-muted)] dark:text-zinc-400">Loading chart data...</div>
                      )}
                    </div>
                  </div>

                  {/* Daily Revenue Line Chart */}
                  <div className="bg-white border border-[var(--border)] dark:bg-zinc-900 dark:border-zinc-800 rounded-3xl p-6 shadow-sm space-y-4 text-[var(--foreground)] dark:text-white">
                    <div>
                      <h4 className="text-sm font-black text-[var(--foreground)] dark:text-white">Daily Revenue Trend</h4>
                      <p className="text-[10px] text-[var(--text-muted)] dark:text-zinc-400">Invoices generated in the past 30 days</p>
                    </div>

                    <div className="h-64 flex items-center justify-center p-2">
                      {analytics?.revenue_daily ? (
                        renderLineChart(analytics.revenue_daily)
                      ) : (
                        <div className="text-xs text-[var(--text-muted)] dark:text-zinc-400">Loading chart data...</div>
                      )}
                    </div>
                  </div>

                  {/* Future Appointments Histogram */}
                  <div className="bg-white border border-[var(--border)] dark:bg-zinc-900 dark:border-zinc-800 rounded-3xl p-6 shadow-sm lg:col-span-2 space-y-4 text-[var(--foreground)] dark:text-white">
                    <div>
                      <h4 className="text-sm font-black text-[var(--foreground)] dark:text-white">Upcoming Booking Density (Next 14 Days)</h4>
                      <p className="text-[10px] text-[var(--text-muted)] dark:text-zinc-400">Future slots scheduled date-wise</p>
                    </div>

                    <div className="h-64 flex items-center justify-center p-2">
                      {analytics?.appointments_future ? (
                        renderHistogram(analytics.appointments_future)
                      ) : (
                        <div className="text-xs text-[var(--text-muted)] dark:text-zinc-400">Loading chart data...</div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB: WHATSAPP LINKING */}
            {activeTab === "whatsapp" && (
              <div className="max-w-xl mx-auto bg-[var(--card)] border border-[var(--border)] rounded-3xl p-6 shadow-sm space-y-6">
                <div className="text-center space-y-2">
                  <Smartphone className="w-12 h-12 text-indigo-500 mx-auto" />
                  <h2 className="text-xl font-black">WhatsApp Device Linking</h2>
                  <p className="text-xs text-slate-400">
                    Connect your clinic WhatsApp account using whatsmeow QR code or pairing code. This enables instant bill slips dispatch.
                  </p>
                </div>

                <div className="p-4 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center space-x-3 text-xs">
                  <AlertCircle className="w-5 h-5 text-indigo-500 flex-shrink-0" />
                  <div>
                    <span className="font-bold">WhatsApp Client is: </span>
                    <span
                      className={`font-black uppercase ${
                        waStatus === "CONNECTED" ? "text-emerald-500" : "text-amber-500 animate-pulse"
                      }`}
                    >
                      {waStatus}
                    </span>
                  </div>
                </div>

                {waStatus !== "CONNECTED" && (
                  <div className="space-y-6 border-t border-[var(--border)] pt-6">
                    <div className="flex justify-center space-x-2 border border-[var(--border)] rounded-xl p-1 text-[10px] font-bold">
                      <button
                        onClick={() => {
                          setPairCode("");
                          loadWhatsAppStatus();
                        }}
                        className="flex-grow py-2 rounded-lg cursor-pointer bg-indigo-600 text-white"
                      >
                        Link via QR Code
                      </button>
                    </div>

                    {/* QR Code Stream */}
                    {qrDataUrl ? (
                      <div className="flex flex-col items-center space-y-4">
                        <div className="p-3 bg-white rounded-3xl shadow-md border border-slate-200">
                          <img src={qrDataUrl} alt="WhatsApp Pairing QR" className="w-48 h-48" />
                        </div>
                        <p className="text-[10px] text-slate-400 text-center">
                          Open WhatsApp on your phone → Linked Devices → Link a Device. Scan the QR code above.
                        </p>
                      </div>
                    ) : (
                      <div className="text-center text-xs text-slate-400 py-6 animate-pulse">
                        Generating latest QR code pairing stream...
                      </div>
                    )}

                    <div className="relative flex py-3 items-center">
                      <div className="flex-grow border-t border-[var(--border)]"></div>
                      <span className="flex-shrink mx-4 text-slate-400 text-[10px] uppercase font-bold">Or Link by phone number</span>
                      <div className="flex-grow border-t border-[var(--border)]"></div>
                    </div>

                    {/* Phone Pairing Code */}
                    <form onSubmit={handleWhatsAppPairing} className="space-y-3">
                      <div>
                        <label className="text-[10px] font-bold uppercase text-slate-400">Phone Number (with Country Code)</label>
                        <input
                          type="text"
                          placeholder="e.g. +919999999999"
                          value={pairPhone}
                          onChange={(e) => setPairPhone(e.target.value)}
                          className="w-full mt-1 px-4 py-2 border border-[var(--border)] rounded-2xl bg-[var(--input-bg)] focus:outline-none text-xs"
                        />
                      </div>
                      <button
                        type="submit"
                        disabled={isPairing}
                        className="w-full py-2.5 bg-slate-900 dark:bg-slate-100 text-white dark:text-black font-bold rounded-2xl text-xs hover:opacity-90 transition cursor-pointer"
                      >
                        {isPairing ? "Generating pairing code..." : "Generate Pairing Code"}
                      </button>
                    </form>

                    {pairCode && (
                      <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-4 text-center space-y-2">
                        <span className="text-[9px] uppercase font-bold text-emerald-500">Your Link Code</span>
                        <div className="text-3xl font-black tracking-widest text-emerald-500">{pairCode}</div>
                        <p className="text-[10px] text-slate-400">
                          Enter this pairing code in WhatsApp Linked Devices → Link with Phone Number.
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {waStatus === "CONNECTED" && (
                  <div className="text-center py-6 text-xs text-slate-400">
                    <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-2 animate-bounce" />
                    <span>WhatsApp client is authenticated and sending automated notifications!</span>
                  </div>
                )}

                {/* Message Templates Section */}
                <div className="border-t border-[var(--border)] pt-6 mt-6 space-y-4">
                  <h3 className="text-sm font-black text-slate-800 dark:text-slate-200">Message Templates</h3>
                  <p className="text-[11px] text-slate-400">
                    Customize your automated WhatsApp messages. Use the chips as placeholders.
                  </p>

                  {(["bill_notification", "overdue_reminder"] as const).map((key) => {
                    const isEditing = editingTemplate === key;
                    const tmpl = waTemplates[key];
                    const label = key === "bill_notification" ? "Bill Notification Template" : "Overdue Reminder Template";
                    const chips = key === "bill_notification" 
                      ? ["{patient_name}", "{total_amount}", "{remaining_amount}", "{clinic_name}", "{items_list}", "{bill_link}", "{payment_details}", "{description}"]
                      : ["{patient_name}", "{remaining_amount}", "{clinic_name}", "{bill_link}", "{description}"];

                    return (
                      <div key={key} className="border border-[var(--border)] rounded-2xl p-4 bg-[var(--nav-bg)] space-y-3">
                        <div className="flex justify-between items-center">
                          <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300">{label}</h4>
                          <button
                            onClick={() => {
                              if (isEditing) {
                                setEditingTemplate(null);
                              } else {
                                setEditingTemplate(key);
                              }
                            }}
                            className="text-xs text-indigo-500 hover:underline font-semibold flex items-center space-x-1 cursor-pointer"
                          >
                            {isEditing ? (
                              <>
                                <X className="w-3 h-3" />
                                <span>Cancel</span>
                              </>
                            ) : (
                              <>
                                <Pencil className="w-3 h-3" />
                                <span>Edit</span>
                              </>
                            )}
                          </button>
                        </div>

                        {/* Chips list */}
                        <div className="flex flex-wrap gap-1.5">
                          {chips.map(chip => (
                            <span 
                              key={chip} 
                              onClick={() => {
                                if (isEditing) {
                                  setWaTemplates(prev => ({
                                    ...prev,
                                    [key]: {
                                      ...prev[key],
                                      body: prev[key].body + chip
                                    }
                                  }));
                                }
                              }}
                              className={`text-[9px] font-mono px-2 py-0.5 rounded-md ${
                                isEditing ? "bg-indigo-500/10 text-indigo-500 hover:bg-indigo-500/20 cursor-pointer" : "bg-slate-500/10 text-slate-400"
                              }`}
                            >
                              {chip}
                            </span>
                          ))}
                        </div>

                        {isEditing ? (
                          <div className="space-y-3 pt-2">
                            <div>
                              <label className="text-[9px] font-bold uppercase text-slate-400 block mb-1">Greeting</label>
                              <input
                                type="text"
                                value={tmpl.greeting}
                                onChange={(e) => setWaTemplates(prev => ({
                                  ...prev,
                                  [key]: { ...prev[key], greeting: e.target.value }
                                }))}
                                className="w-full px-3 py-1.5 border border-[var(--border)] rounded-xl bg-[var(--input-bg)] text-xs focus:ring-1 focus:ring-indigo-500 outline-none"
                              />
                            </div>
                            <div>
                              <label className="text-[9px] font-bold uppercase text-slate-400 block mb-1">Body Text</label>
                              <textarea
                                value={tmpl.body}
                                rows={4}
                                onChange={(e) => setWaTemplates(prev => ({
                                  ...prev,
                                  [key]: { ...prev[key], body: e.target.value }
                                }))}
                                className="w-full px-3 py-1.5 border border-[var(--border)] rounded-xl bg-[var(--input-bg)] text-xs focus:ring-1 focus:ring-indigo-500 outline-none resize-none"
                              />
                            </div>
                            <div>
                              <label className="text-[9px] font-bold uppercase text-slate-400 block mb-1">Footer</label>
                              <input
                                type="text"
                                value={tmpl.footer}
                                onChange={(e) => setWaTemplates(prev => ({
                                  ...prev,
                                  [key]: { ...prev[key], footer: e.target.value }
                                }))}
                                className="w-full px-3 py-1.5 border border-[var(--border)] rounded-xl bg-[var(--input-bg)] text-xs focus:ring-1 focus:ring-indigo-500 outline-none"
                              />
                            </div>

                            <div className="flex justify-end space-x-2 pt-1">
                              <button
                                onClick={() => loadWhatsAppTemplates().then(() => setEditingTemplate(null))}
                                className="px-3 py-1.5 border border-[var(--border)] text-slate-500 font-bold rounded-xl text-[10px] hover:bg-[var(--card-hover)] cursor-pointer"
                              >
                                Reset
                              </button>
                              <button
                                onClick={() => handleSaveTemplate(key)}
                                disabled={templateSaving}
                                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-[10px] shadow-sm flex items-center space-x-1 cursor-pointer"
                              >
                                {templateSaving ? (
                                  <span>Saving...</span>
                                ) : (
                                  <>
                                    <Save className="w-3.5 h-3.5" />
                                    <span>Save Template</span>
                                  </>
                                )}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="bg-[var(--input-bg)] border border-[var(--border)] rounded-xl p-3 text-[11px] font-mono text-slate-600 dark:text-white whitespace-pre-wrap leading-relaxed">
                            <span className="font-bold text-slate-400 block text-[9px] uppercase tracking-wider mb-1">Preview</span>
                            {tmpl.greeting ? tmpl.greeting : "Dear {patient_name},"}
                            {"\n\n"}
                            {tmpl.body ? tmpl.body : "..."}
                            {"\n\n"}
                            {tmpl.footer ? tmpl.footer : "..."}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        ) : viewState.type === "patient" ? (
          /* VIEW: PATIENT DETAILS */
          <div className="space-y-6 animate-fade-in">
            <button
              onClick={() => {
                setViewState({ type: "list" });
                loadPatients();
              }}
              className="flex items-center space-x-1.5 text-xs font-bold text-indigo-500 hover:text-indigo-600 transition cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back to Directory</span>
            </button>

            {currentPatientData ? (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Profile Card */}
                <div className="bg-[var(--card)] border border-[var(--border)] rounded-3xl p-6 shadow-sm space-y-5 lg:col-span-1">
                  <div>
                    <h2 className="text-2xl font-black">{currentPatientData.patient.name}</h2>
                    <p className="text-xs text-slate-400 font-bold uppercase mt-1">Patient ID: #PAT-{currentPatientData.patient.id}</p>
                  </div>

                  <div className="space-y-3.5 border-t border-[var(--border)] pt-4 text-xs">
                    <div>
                      <span className="text-slate-400 font-semibold block">Phone Contact</span>
                      <span className="font-bold">{currentPatientData.patient.phone}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 font-semibold block">Gender / Age</span>
                      <span className="font-bold">{currentPatientData.patient.gender} ({currentPatientData.patient.age} yrs)</span>
                    </div>
                    <div>
                      <span className="text-slate-400 font-semibold block">Medical Records Summary</span>
                      <span className="font-medium text-slate-500 dark:text-slate-400 block whitespace-pre-wrap mt-1">
                        {currentPatientData.patient.medical_history || "No logs on file."}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 font-semibold block">Outstanding Ledger Balance</span>
                      <span className="font-black text-red-500 text-lg block mt-0.5">
                        ₹{currentPatientData.patient.total_dues.toLocaleString("en-IN")}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Booking History & Bills */}
                <div className="lg:col-span-2 space-y-6">
                  {/* Appointments grid */}
                  <div className="bg-[var(--card)] border border-[var(--border)] rounded-3xl p-6 shadow-sm space-y-4">
                    <h3 className="text-sm font-black">Agenda Log (Appointments)</h3>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="border-b border-[var(--border)] bg-[var(--nav-bg)] text-slate-500 dark:text-slate-400 font-bold uppercase">
                            <th className="px-4 py-3">Scheduled Date</th>
                            <th className="px-4 py-3">Consultation Reason</th>
                            <th className="px-4 py-3 text-right">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {currentPatientData.appointments.length > 0 ? (
                            currentPatientData.appointments.map((ap) => (
                              <tr key={ap.id} className="border-b border-[var(--border)]">
                                <td className="px-4 py-3 font-semibold">{new Date(ap.appointment_date).toLocaleString()}</td>
                                <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{ap.reason}</td>
                                <td className="px-4 py-3 text-right">
                                  <span
                                    className={`inline-flex px-2 py-0.5 rounded-full text-[9px] font-bold ${
                                      ap.status === "COMPLETED"
                                        ? "bg-emerald-500/10 text-emerald-500"
                                        : ap.status === "CANCELLED"
                                        ? "bg-red-500/10 text-red-500"
                                        : "bg-amber-500/10 text-amber-500"
                                    }`}
                                  >
                                    {ap.status}
                                  </span>
                                </td>
                              </tr>
                            ))
                          ) : (
                            <tr>
                              <td colSpan={3} className="px-4 py-6 text-center text-slate-400 font-semibold">
                                No appointments on record.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Billing Ledger */}
                  <div className="bg-[var(--card)] border border-[var(--border)] rounded-3xl p-6 shadow-sm space-y-4">
                    <h3 className="text-sm font-black">Billing Invoices</h3>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="border-b border-[var(--border)] bg-[var(--nav-bg)] text-slate-500 dark:text-slate-400 font-bold uppercase">
                            <th className="px-4 py-3">Invoice ID</th>
                            <th className="px-4 py-3">Details / Diagnosis</th>
                            <th className="px-4 py-3">Total</th>
                            <th className="px-4 py-3">Dues</th>
                            <th className="px-4 py-3">Status</th>
                            <th className="px-4 py-3 text-right">Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {currentPatientData.contracts.length > 0 ? (
                            currentPatientData.contracts.map((bill) => (
                              <tr
                                key={bill.id}
                                className="border-b border-[var(--border)] hover:bg-[var(--card-hover)] transition cursor-pointer"
                                onClick={() => setViewState({ type: "bill", billId: bill.id })}
                              >
                                <td className="px-4 py-3 font-bold">#INV-{bill.id}</td>
                                <td className="px-4 py-3 text-slate-400 max-w-xs truncate">{bill.description}</td>
                                <td className="px-4 py-3 font-semibold">₹{bill.total_amount.toFixed(2)}</td>
                                <td className="px-4 py-3 font-bold text-red-500">₹{bill.remaining_amount.toFixed(2)}</td>
                                <td className="px-4 py-3">
                                  <span
                                    className={`inline-block px-2 py-0.5 rounded-full text-[9px] font-bold ${
                                      bill.status === "SETTLED"
                                        ? "bg-emerald-500/10 text-emerald-500"
                                        : bill.status === "PARTIALLY_PAID"
                                        ? "bg-amber-500/10 text-amber-500"
                                        : "bg-red-500/10 text-red-500"
                                    }`}
                                  >
                                    {bill.status}
                                  </span>
                                </td>
                                <td className="px-4 py-3 text-right">
                                  <button className="text-[10px] font-bold text-indigo-500 hover:underline">
                                    View Receipt
                                  </button>
                                </td>
                              </tr>
                            ))
                          ) : (
                            <tr>
                              <td colSpan={6} className="px-4 py-6 text-center text-slate-400 font-semibold">
                                No billing records on file.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-xs text-slate-400 animate-pulse">Loading profile data...</div>
            )}
          </div>
        ) : (
          /* VIEW: BILL DETAILS */
          <div className="space-y-6 animate-fade-in">
            <button
              onClick={() => {
                if (currentPatientData) {
                  setViewState({ type: "patient", patientId: currentPatientData.patient.id });
                } else {
                  setViewState({ type: "list" });
                }
              }}
              className="flex items-center space-x-1.5 text-xs font-bold text-indigo-500 hover:text-indigo-600 transition cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back to Patient Ledger</span>
            </button>

            {currentBillData ? (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Summary Card */}
                <div className="bg-[var(--card)] border border-[var(--border)] rounded-3xl p-6 shadow-sm space-y-6 lg:col-span-1">
                  <div>
                    <h2 className="text-xl font-black">Invoice #INV-{currentBillData.bill.id}</h2>
                    <p className="text-[9px] text-slate-400 uppercase tracking-widest mt-1">
                      Clinic: {currentBillData.bill.clinic_name}
                    </p>
                  </div>

                  <div className="space-y-4 border-t border-[var(--border)] pt-4 text-xs">
                    <div>
                      <span className="text-slate-400 block">Total Invoiced</span>
                      <span className="text-xl font-black">₹{currentBillData.bill.total_amount.toLocaleString("en-IN")}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block">Remaining Balance Due</span>
                      <span className="text-xl font-black text-red-500">₹{currentBillData.bill.remaining_amount.toLocaleString("en-IN")}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block">Billing Status</span>
                      <span
                        className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold mt-1 ${
                          currentBillData.bill.status === "SETTLED"
                            ? "bg-emerald-500/10 text-emerald-500"
                            : currentBillData.bill.status === "PARTIALLY_PAID"
                            ? "bg-amber-500/10 text-amber-500"
                            : "bg-red-500/10 text-red-500"
                        }`}
                      >
                        {currentBillData.bill.status}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2 pt-2 border-t border-[var(--border)]">
                    <button
                      onClick={() => generateInvoicePDF(currentBillData)}
                      className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-2xl text-xs flex items-center justify-center space-x-2 transition cursor-pointer"
                    >
                      <Download className="w-4 h-4" />
                      <span>Download PDF Slip</span>
                    </button>

                    {currentBillData.bill.remaining_amount > 0 && (
                      <FloatingPanelRoot isOpen={isLogPaymentOpen} onOpenChange={setIsLogPaymentOpen}>
                        <FloatingPanelTrigger
                          title="Record Payment installment"
                          className="w-full py-2.5 border border-indigo-600/30 text-indigo-500 hover:bg-indigo-500/10 font-bold rounded-2xl text-xs transition cursor-pointer justify-center"
                        >
                          Record Installment Payment
                        </FloatingPanelTrigger>
                        <FloatingPanelContent className="w-80 sm:w-96 text-left">
                          <FloatingPanelBody>
                            <form onSubmit={handleLogPayment} className="space-y-4 text-xs text-[var(--foreground)]">
                              <div>
                                <label className="text-[10px] font-bold uppercase text-slate-400">Amount Paid (INR)</label>
                                <input
                                  type="number"
                                  step="0.01"
                                  required
                                  value={payAmount}
                                  onChange={(e) => setPayAmount(e.target.value)}
                                  className="w-full mt-1 px-4 py-2 border border-[var(--border)] rounded-2xl bg-[var(--input-bg)] text-xs focus:ring-2 focus:ring-indigo-500 outline-none"
                                />
                              </div>

                              <div>
                                <label className="text-[10px] font-bold uppercase text-slate-400">Payment Mode</label>
                                <select
                                  value={payMode}
                                  onChange={(e) => setPayMode(e.target.value as any)}
                                  className="w-full mt-1 px-4 py-2 border border-[var(--border)] rounded-2xl bg-[var(--input-bg)] text-xs focus:ring-2 focus:ring-indigo-500 outline-none"
                                >
                                  <option>CASH</option>
                                  <option>ONLINE_UPI</option>
                                  <option>BANK_TRANSFER</option>
                                </select>
                              </div>

                              <div>
                                <label className="text-[10px] font-bold uppercase text-slate-400">Remarks</label>
                                <input
                                  type="text"
                                  placeholder="Installment remarks"
                                  value={payRemarks}
                                  onChange={(e) => setPayRemarks(e.target.value)}
                                  className="w-full mt-1 px-4 py-2 border border-[var(--border)] rounded-2xl bg-[var(--input-bg)] text-xs focus:ring-2 focus:ring-indigo-500 outline-none"
                                />
                              </div>

                              <div className="flex space-x-2 pt-2 text-xs">
                                <FloatingPanelCloseButton className="w-1/2 py-2.5 rounded-2xl border border-[var(--border)] font-bold text-slate-500 hover:bg-[var(--card-hover)] transition cursor-pointer justify-center" />
                                <FloatingPanelSubmitButton
                                  label="Save Installment"
                                  className="w-1/2 py-2.5 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold shadow-md transition cursor-pointer ml-0 h-auto justify-center"
                                />
                              </div>
                            </form>
                          </FloatingPanelBody>
                        </FloatingPanelContent>
                      </FloatingPanelRoot>
                    )}
                  </div>
                </div>

                {/* Items & Payments Timeline */}
                <div className="lg:col-span-2 space-y-6">
                  {/* Prescribed Items */}
                  <div className="bg-[var(--card)] border border-[var(--border)] rounded-3xl p-6 shadow-sm space-y-4">
                    <h3 className="text-sm font-black">Prescribed Medicines & Consultation Lines</h3>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="border-b border-[var(--border)] bg-[var(--nav-bg)] text-slate-500 dark:text-slate-400 font-bold uppercase">
                            <th className="px-4 py-3">Prescription Name</th>
                            <th className="px-4 py-3">Quantity</th>
                            <th className="px-4 py-3">Unit Price</th>
                            <th className="px-4 py-3">Dosage Instructions</th>
                            <th className="px-4 py-3 text-right">Subtotal</th>
                          </tr>
                        </thead>
                        <tbody>
                          {currentBillData.items.map((item) => (
                            <tr key={item.id} className="border-b border-[var(--border)]">
                              <td className="px-4 py-3 font-bold">{item.item_name}</td>
                              <td className="px-4 py-3 font-semibold text-slate-500 dark:text-slate-400">{item.quantity}</td>
                              <td className="px-4 py-3 text-slate-500 dark:text-slate-400">₹{item.unit_price.toFixed(2)}</td>
                              <td className="px-4 py-3 text-slate-400">{item.dosage || "As advised"}</td>
                              <td className="px-4 py-3 text-right font-semibold">
                                ₹{(item.quantity * item.unit_price).toFixed(2)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Payment install history */}
                  <div className="bg-[var(--card)] border border-[var(--border)] rounded-3xl p-6 shadow-sm space-y-4">
                    <h3 className="text-sm font-black">Payment Installment Timeline</h3>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="border-b border-[var(--border)] bg-[var(--nav-bg)] text-slate-500 dark:text-slate-400 font-bold uppercase">
                            <th className="px-4 py-3">Payment ID</th>
                            <th className="px-4 py-3">Date</th>
                            <th className="px-4 py-3">Mode</th>
                            <th className="px-4 py-3">Notes / Remarks</th>
                            <th className="px-4 py-3 text-right">Amount Paid</th>
                          </tr>
                        </thead>
                        <tbody>
                          {currentBillData.payments.length > 0 ? (
                            currentBillData.payments.map((p) => (
                              <tr key={p.id} className="border-b border-[var(--border)]">
                                <td className="px-4 py-3 font-bold">#PAY-{p.id}</td>
                                <td className="px-4 py-3 text-slate-500 dark:text-slate-400">
                                  {new Date(p.payment_date).toLocaleString()}
                                </td>
                                <td className="px-4 py-3">
                                  <span className="px-2.5 py-0.5 rounded-full bg-indigo-500/10 text-indigo-500 text-[10px] font-bold">
                                    {p.payment_mode}
                                  </span>
                                </td>
                                <td className="px-4 py-3 text-slate-400">{p.remarks || "-"}</td>
                                <td className="px-4 py-3 text-right font-black text-emerald-500">
                                  + ₹{p.amount_paid.toFixed(2)}
                                </td>
                              </tr>
                            ))
                          ) : (
                            <tr>
                              <td colSpan={5} className="px-4 py-6 text-center text-slate-400 font-semibold">
                                No payments logged yet.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-xs text-slate-400 animate-pulse">Loading billing details...</div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
