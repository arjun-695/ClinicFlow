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
  RotateCcw,
  Settings,
  AlertTriangle,
} from "lucide-react";
import { fetchAPI, API_URL } from "../../utils/api";
import { cn } from "../../utils/cn";
import { useRouter } from "next/navigation";
import useMeasure from "react-use-measure";
import dynamic from "next/dynamic";

const ThemeToggleButton = dynamic(
  () =>
    import("../../components/ui/theme-toggle").then(
      (mod) => mod.ThemeToggleButton,
    ),
  { ssr: false },
);

const FloatingPanelRoot = dynamic(
  () =>
    import("../../components/ui/floating-panel").then(
      (mod) => mod.FloatingPanelRoot,
    ),
  { ssr: false },
);
const FloatingPanelTrigger = dynamic(
  () =>
    import("../../components/ui/floating-panel").then(
      (mod) => mod.FloatingPanelTrigger,
    ),
  { ssr: false },
);
const FloatingPanelContent = dynamic(
  () =>
    import("../../components/ui/floating-panel").then(
      (mod) => mod.FloatingPanelContent,
    ),
  { ssr: false },
);
const FloatingPanelBody = dynamic(
  () =>
    import("../../components/ui/floating-panel").then(
      (mod) => mod.FloatingPanelBody,
    ),
  { ssr: false },
);
const FloatingPanelFooter = dynamic(
  () =>
    import("../../components/ui/floating-panel").then(
      (mod) => mod.FloatingPanelFooter,
    ),
  { ssr: false },
);
const FloatingPanelCloseButton = dynamic(
  () =>
    import("../../components/ui/floating-panel").then(
      (mod) => mod.FloatingPanelCloseButton,
    ),
  { ssr: false },
);
const FloatingPanelSubmitButton = dynamic(
  () =>
    import("../../components/ui/floating-panel").then(
      (mod) => mod.FloatingPanelSubmitButton,
    ),
  { ssr: false },
);

const TabTransition = dynamic(
  () => import("../../components/ui/tab-transition"),
  { ssr: false },
);
const WhatsAppPanel = dynamic(() => import("./components/WhatsAppPanel"), {
  ssr: false,
});
const QueuePanel = dynamic(() => import("./components/QueuePanel"), {
  ssr: false,
});
const TabBubble = dynamic(() => import("../../components/ui/tab-bubble"), {
  ssr: false,
});

const COMMON_MEDICINES = [
  // --- Analgesics & Antipyretics (General/Pediatrics) ---
  "Crocin 500mg",
  "Crocin 650mg",
  "Crocin Pain Relief",
  "Dolo 650mg",
  "Calpol 500mg",
  "Calpol 650mg",
  "Paracetamol 500mg",
  "Paracetamol 650mg",
  "Ibuprofen 400mg",
  "Ibugesic Plus (Ibuprofen + Paracetamol)",
  "Mefenamic Acid (Meftal 500mg)",
  "Mefenamic Acid + Dicyclomine (Meftal-Spas)",
  "Diclofenac 50mg (Voveran)",
  "Aceclofenac + Paracetamol (Zerodol P)",
  "Etoricoxib 90mg (Nucoxia)",
  "Etoricoxib 120mg (Nucoxia)",
  "Tramadol 50mg (Tramazac)",
  "Ultracet (Tramadol + Paracetamol)",

  // --- Gastrointestinal (Gastroenterology) ---
  "Omeprazole 20mg (Omez)",
  "Omeprazole 40mg",
  "Pantoprazole 40mg (Pan 40)",
  "Pantoprazole + Domperidone (Pan-D)",
  "Rabeprazole 20mg (Veloz)",
  "Rabeprazole + Domperidone (Veloz-D)",
  "Esomeprazole 40mg (Nexpro)",
  "Ranitidine 150mg (Rantac)",
  "Ondansetron 4mg (Emset)",
  "Ondansetron 8mg (Emset)",
  "Domperidone 10mg",
  "Metoclopramide 10mg (Reglan)",
  "Loperamide 2mg (Lopamide)",
  "Dicyclomine 10mg (Cyclopam)",
  "Digene Gel / Antacid liquid",
  "Cremaffin Plus Syrup",
  "Sucralfate Suspension (Oraflam)",
  "Sporolac / Probiotic Capsule",

  // --- Antibiotics & Antivirals (General Medicine / Infectious Diseases) ---
  "Amoxicillin 500mg",
  "Amoxicillin + Clavulanic Acid 625mg (Augmentin)",
  "Azithromycin 250mg (Azee)",
  "Azithromycin 500mg (Azee)",
  "Ciprofloxacin 500mg (Ciplox)",
  "Doxycycline 100mg (Doxyt)",
  "Ofloxacin 200mg (Oflox)",
  "Ofloxacin + Ornidazole (O2)",
  "Metronidazole 400mg (Metrogyl)",
  "Cefixime 200mg (Taxim-O)",
  "Cefuroxime Axetil 500mg (Ceftum)",
  "Clarithromycin 500mg",
  "Albendazole 400mg (Zentel)",
  "Acyclovir 400mg (Acivir)",
  "Oseltamivir 75mg (Antiflu)",

  // --- Cardiovascular & Antihypertensives (Cardiology) ---
  "Aspirin 75mg (Ecosprin)",
  "Aspirin 150mg (Ecosprin)",
  "Clopidogrel 75mg (Clopilet)",
  "Atorvastatin 10mg (Lipivas)",
  "Atorvastatin 20mg (Lipivas)",
  "Atorvastatin 40mg (Lipivas)",
  "Rosuvastatin 10mg (Rosuvas)",
  "Rosuvastatin 20mg (Rosuvas)",
  "Amlodipine 5mg (Amlokind)",
  "Amlodipine 10mg (Amlokind)",
  "Telmisartan 40mg (Telma)",
  "Telmisartan 80mg (Telma)",
  "Telmisartan + Amlodipine (Telma-AM)",
  "Losartan 50mg (Covance)",
  "Metoprolol Succinate 25mg (Metolar XR)",
  "Metoprolol Succinate 50mg (Metolar XR)",
  "Ramipril 2.5mg (Cardace)",
  "Ramipril 5mg (Cardace)",
  "Furosemide 40mg (Lasix)",
  "Spironolactone 25mg (Aldactone)",
  "Hydrochlorothiazide 12.5mg",

  // --- Antidiabetics & Endocrinology (Diabetology / Thyroid) ---
  "Metformin 500mg (Glycomet)",
  "Metformin 1000mg (Glycomet SR)",
  "Glimepiride 1mg (Amaryl)",
  "Glimepiride 2mg (Amaryl)",
  "Glimepiride + Metformin (Glimisave M2)",
  "Teneligliptin 20mg (Dynaglipt)",
  "Sitagliptin 50mg (Januvia)",
  "Sitagliptin 100mg (Januvia)",
  "Dapagliflozin 5mg (Forxiga)",
  "Dapagliflozin 10mg (Forxiga)",
  "Empagliflozin 10mg (Jardiance)",
  "Empagliflozin 25mg (Jardiance)",
  "Vildagliptin 50mg (Galvus)",
  "Thyroxine Sodium 25mcg (Thyronorm)",
  "Thyroxine Sodium 50mcg (Thyronorm)",
  "Thyroxine Sodium 75mcg (Thyronorm)",
  "Thyroxine Sodium 100mcg (Thyronorm)",
  "Lantus Solostar Pen (Insulin Glargine)",

  // --- Respiratory & Allergy (Pulmonology / ENT) ---
  "Cetirizine 10mg (Okacet)",
  "Levocetirizine 5mg (Lecope)",
  "Montelukast 10mg",
  "Montelukast + Levocetirizine (Montair LC)",
  "Loratadine 10mg (Claritin)",
  "Fexofenadine 120mg (Allegra)",
  "Fexofenadine 180mg (Allegra)",
  "Asthalin Inhaler (Salbutamol)",
  "Budecort Inhaler (Budecort)",
  "Duolin Inhaler (Levosalbutamol + Ipratropium)",
  "Flomist Nasal Spray (Fluticasone)",
  "Otrivin Nasal Drops (Xylometazoline)",
  "Alex Cough Syrup (Dextromethorphan + Phenylephrine)",
  "Ascoril LS Syrup (Ambroxol + Levosalbutamol)",

  // --- Neurology & Psychiatry (Neurology / Mental Health) ---
  "Escitalopram 10mg (Nexito)",
  "Escitalopram 20mg (Nexito)",
  "Sertraline 50mg (Sertima)",
  "Sertraline 100mg (Sertima)",
  "Fluoxetine 20mg (Fludac)",
  "Alprazolam 0.25mg (Alprax)",
  "Alprazolam 0.5mg (Alprax)",
  "Clonazepam 0.25mg (Clonefit)",
  "Clonazepam 0.5mg (Clonefit)",
  "Gabapentin 300mg (Gabapin)",
  "Pregabalin 75mg (Pregalin)",
  "Pregabalin 150mg (Pregalin)",
  "Amitriptyline 10mg (Tryptomer)",
  "Amitriptyline 25mg (Tryptomer)",
  "Levetiracetam 500mg (Keppra)",
  "Sodium Valproate 200mg (Encorate)",
  "Sodium Valproate 500mg (Encorate)",
  "Donepezil 5mg (Aricept)",

  // --- Dermatology (Skin / Infections) ---
  "Fluconazole 150mg (Syscan)",
  "Itraconazole 100mg (Canditral)",
  "Itraconazole 200mg (Canditral)",
  "Terbinafine 250mg (Sebifin)",
  "Isotretinoin 10mg (Sotret)",
  "Isotretinoin 20mg (Sotret)",
  "Ketoconazole 2% Cream",
  "Mupirocin 2% Ointment (T-Bact)",
  "Betamethasone Dipropionate Cream (Betnovate)",
  "Clobetasol Propionate Cream (Tenovate)",
  "Hydrocortisone 1% Cream",

  // --- Gynecology & Obstetrics ---
  "Norethisterone 5mg (Regestrone)",
  "Progesterone 200mg (Susten)",
  "Cabergoline 0.5mg (Cabgolin)",
  "Mifepristone 200mg + Misoprostol 200mcg Kit",
  "Clomiphene Citrate 50mg (Clofert)",
  "Doxylamine Succinate + Pyridoxine (Pregnidoxin)",

  // --- Vitamins, Minerals & Supplements ---
  "Vitamin C (Ascorbic Acid) 500mg (Limcee)",
  "Vitamin D3 60K Capsule (Calcirol)",
  "Zinc Sulphate 20mg",
  "B-Complex with Vitamin C (Becosules)",
  "Multivitamin & Minerals (A to Z)",
  "Calcium Carbonate + Vitamin D3 (Shelcal 500)",
  "Folic Acid 5mg (Folvite)",
  "Ferrous Ascorbate + Folic Acid (Orofer XT)",

  // --- Ophthalmology & ENT Drops ---
  "Carboxymethylcellulose 0.5% Eye Drops (Refresh Tears)",
  "Ciplox Eye/Ear Drops (Ciprofloxacin)",
  "Milflodex Eye Drops (Moxifloxacin)",
  "Tobramycin Eye Drops (Toba)",
];

// --- State Types ---
type ViewState =
  | { type: "list" }
  | { type: "patient"; patientId: number }
  | { type: "bill"; billId: number }
  | { type: "patient_vitals"; patientId: number };

// --- Interfaces ---
export interface Patient {
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

export interface BillItem {
  id?: number;
  item_name: string;
  quantity: number;
  unit_price: number;
  dosage: string;
}

export interface Bill {
  id: number;
  patient_id: number;
  patient_name: string;
  patient_phone: string;
  patient_gender?: string;
  patient_age?: number | string;
  weight?: string;
  bp?: string;
  pulse?: string;
  temp?: string;
  doctor_id: number;
  doctor_name?: string;
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

export interface Appointment {
  id: number;
  patient_id: number;
  patient_name: string;
  patient_phone: string;
  doctor_id: number;
  appointment_date: string;
  status: "PENDING" | "COMPLETED" | "CANCELLED";
  reason: string;
  created_at: string;
  slot_time?: string;
  doctor_name?: string;
}

export interface Medicine {
  id: number;
  name: string;
  stock: number;
  price: number;
}

export interface Payment {
  id: number;
  contract_id: number; // mapped back from bill_id
  amount_paid: number;
  payment_mode: string;
  remarks: string;
  payment_date: string;
}

export interface PatientDetail {
  patient: Patient;
  contracts: Bill[]; // mapped to contracts key for dashboard compatibility
  appointments: Appointment[];
  prescriptions?: any[];
}

export interface BillPrescriptionItem {
  medicine_name: string;
  dosage: string;
  frequency: string;
  duration: string;
  quantity: number;
  instructions: string;
}

export interface BillPrescriptionDetail {
  id: number;
  diagnosis: string;
  notes: string;
  created_at: string;
  items: BillPrescriptionItem[];
  lab_requests: string[];
}

export interface BillDetail {
  bill: Bill;
  items: BillItem[];
  payments: Payment[];
  prescription?: BillPrescriptionDetail;
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

function checkBPRange(bp: string): [boolean, string] {
  const parts = bp.split("/");
  if (parts.length !== 2) return [false, ""];
  const systolic = parseInt(parts[0].trim());
  const diastolic = parseInt(parts[1].trim());
  if (isNaN(systolic) || isNaN(diastolic)) return [false, ""];
  if (systolic > 140)
    return [true, `High Systolic Blood Pressure (${systolic} mmHg)`];
  if (systolic < 90)
    return [true, `Low Systolic Blood Pressure (${systolic} mmHg)`];
  if (diastolic > 90)
    return [true, `High Diastolic Blood Pressure (${diastolic} mmHg)`];
  if (diastolic < 60)
    return [true, `Low Diastolic Blood Pressure (${diastolic} mmHg)`];
  return [false, ""];
}

function checkHRRange(hr: number): [boolean, string] {
  if (hr > 100) return [true, `High Heart Rate (${hr} bpm)`];
  if (hr < 60) return [true, `Low Heart Rate (${hr} bpm)`];
  return [false, ""];
}

export default function Dashboard() {
  const router = useRouter();

  // Authentication & Theme
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [doctorInfo, setDoctorInfo] = useState<{
    id: number;
    email: string;
    name: string;
    clinic_name: string;
    phone: string;
    role: string;
    location?: string;
    photo_url?: string;
    specialization?: string;
    hospital_name?: string;
    active_facility_id?: number;
    facilities?: { id: number; name: string; type: string; role: string; address?: string; phone?: string }[];
  } | null>(null);

  const isClinicMode =
    !doctorInfo ||
    doctorInfo.facilities?.find((f) => f.id === doctorInfo.active_facility_id)
      ?.type !== "HOSPITAL";
  const isDoctorInHospital = doctorInfo?.role === "DOCTOR" && !isClinicMode;

  // Tabs & Views
  const [activeTab, setActiveTab] = useState<
    | "patients"
    | "appointments"
    | "billing"
    | "medicines"
    | "analytics"
    | "doctor-analytics"
    | "whatsapp"
    | "staff"
    | "queue"
    | "vitals"
    | "labs"
    | "reschedule-queue"
    | "availability"
    | "prescriptions"
    | "pharmacy"
  >("patients");
  const [viewState, setViewState] = useState<ViewState>({ type: "list" });
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [direction, setDirection] = useState(0);
  const [contentRef, contentBounds] = useMeasure();
  const [isTransitioning, setIsTransitioning] = useState(false);

  const [billingSubTab, setBillingSubTab] = useState<"queue" | "ledger" | "settings">("queue");
  const [billingSettingsName, setBillingSettingsName] = useState("");
  const [billingSettingsAddress, setBillingSettingsAddress] = useState("");
  const [billingSettingsPhone, setBillingSettingsPhone] = useState("");
  const [testPrices, setTestPrices] = useState<{[key: string]: string}>({});

  useEffect(() => {
    if (doctorInfo) {
      const activeFac = doctorInfo.facilities?.find(
        (f) => f.id === doctorInfo.active_facility_id
      );
      if (activeFac) {
        setBillingSettingsName(activeFac.name || "");
        setBillingSettingsAddress(activeFac.address || "");
        setBillingSettingsPhone(activeFac.phone || "");
      }
    }
  }, [doctorInfo]);

  const lastFacilityIdRef = useRef<number | null>(null);

  useEffect(() => {
    if (doctorInfo) {
      const facilityId = doctorInfo.active_facility_id || null;
      if (lastFacilityIdRef.current !== facilityId) {
        lastFacilityIdRef.current = facilityId;
        const isHospital =
          doctorInfo.facilities?.find((f) => f.id === facilityId)?.type ===
          "HOSPITAL";
        if (isHospital && doctorInfo.role === "DOCTOR") {
          setActiveTab("queue");
        }
      }
    }
  }, [doctorInfo]);

  const getCombinedPhone = (phoneCode: string, rawPhone: string) => {
    const clean = rawPhone.replace(/[\s+-]/g, "");
    const codeDigits = phoneCode.replace("+", "");
    // If the number already starts with the country code and has more than 10 digits, don't prepend it
    if (clean.startsWith(codeDigits) && clean.length > 10) {
      return `+${clean}`;
    }
    return `${phoneCode}${clean}`;
  };

  // Core Data
  const [patients, setPatients] = useState<Patient[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [selectedDoctorForAnalytics, setSelectedDoctorForAnalytics] = useState<string>("");
  const [doctorAnalytics, setDoctorAnalytics] = useState<AnalyticsData | null>(null);
  const [loadingDoctorAnalytics, setLoadingDoctorAnalytics] = useState<boolean>(false);
  const [doctorPatientTimeframe, setDoctorPatientTimeframe] = useState<"weekly" | "monthly" | "yearly">("weekly");
  const [currentPatientData, setCurrentPatientData] =
    useState<PatientDetail | null>(null);
  const [currentBillData, setCurrentBillData] = useState<BillDetail | null>(
    null,
  );
  const [searchQuery, setSearchQuery] = useState("");

  // Modals Open/Close
  const [isAddPatientOpen, setIsAddPatientOpen] = useState(false);
  const [isCheckInOpen, setIsCheckInOpen] = useState(false);
  const [isAddAppointmentOpen, setIsAddAppointmentOpen] = useState(false);
  const [isCreateBillOpen, setIsCreateBillOpen] = useState(false);
  const [isLogPaymentOpen, setIsLogPaymentOpen] = useState(false);
  const [isAddMedicineOpen, setIsAddMedicineOpen] = useState(false);

  // Forms State
  // 1. Patient Form
  const [newPtName, setNewPtName] = useState("");
  const [newPtPhone, setNewPtPhone] = useState("");
  const [newPtPhoneCode, setNewPtPhoneCode] = useState("+91");
  const [newPtGender, setNewPtGender] = useState("Male");
  const [newPtAge, setNewPtAge] = useState("");
  const [newPtHistory, setNewPtHistory] = useState("");
  const [facilityDoctors, setFacilityDoctors] = useState<any[]>([]);
  const [selectedDoctorIds, setSelectedDoctorIds] = useState<number[]>([]);
  const [prescriptions, setPrescriptions] = useState<any[]>([]);
  const [isAddRxOpen, setIsAddRxOpen] = useState(false);
  const [rxPatientId, setRxPatientId] = useState("");
  const [rxDiagnosis, setRxDiagnosis] = useState("");
  const [rxNotes, setRxNotes] = useState("");
  const [rxVisitCharges, setRxVisitCharges] = useState("");
  const [rxAmountPaid, setRxAmountPaid] = useState("");
  const [rxWeight, setRxWeight] = useState("");
  const [rxBP, setRxBP] = useState("");
  const [rxHR, setRxHR] = useState("");
  const [rxPulse, setRxPulse] = useState("");
  const [rxSpO2, setRxSpO2] = useState("");
  const [rxTemp, setRxTemp] = useState("");
  const [rxItems, setRxItems] = useState<any[]>([
    {
      medicine_name: "",
      medicine_id: null,
      dosage: "",
      frequency: "",
      duration: "",
      quantity: 1,
      instructions: "",
    },
  ]);
  const [pendingPrescriptions, setPendingPrescriptions] = useState<any[]>([]);
  const [activeRxToDispense, setActiveRxToDispense] = useState<any | null>(
    null,
  );
  const [dispenseItems, setDispenseItems] = useState<any[]>([]);
  const [dispenseAmountPaid, setDispenseAmountPaid] = useState("");
  const [expandedRxId, setExpandedRxId] = useState<number | null>(null);

  // 2. Appointment Form
  const [apptPatientId, setApptPatientId] = useState("");
  const [apptDoctorId, setApptDoctorId] = useState("");
  const [apptSlotId, setApptSlotId] = useState("");
  const [apptDate, setApptDate] = useState("");
  const [apptReason, setApptReason] = useState("");
  const [availableSlots, setAvailableSlots] = useState<any[]>([]);
  // Slot Configurator state
  const [configDoctorId, setConfigDoctorId] = useState("");
  const [configWeeklyAvail, setConfigWeeklyAvail] = useState<any[]>(
    Array.from({ length: 7 }, (_, i) => ({
      day_of_week: i,
      start_time: "09:00",
      end_time: "17:00",
      slot_duration_minutes: 60,
      max_patients_per_slot: 1,
      is_active: false,
    })),
  );
  const [generateStartDate, setGenerateStartDate] = useState("");
  const [generateEndDate, setGenerateEndDate] = useState("");
  const [slotPreviews, setSlotPreviews] = useState<any[]>([]);

  // Unavailability & Rescheduling state
  const [unavailDoctorId, setUnavailDoctorId] = useState("");
  const [unavailDate, setUnavailDate] = useState("");
  const [unavailReason, setUnavailReason] = useState("");
  const [rescheduleQueue, setRescheduleQueue] = useState<any[]>([]);
  const [activeRescheduleItem, setActiveRescheduleItem] = useState<any | null>(
    null,
  );
  const [reschedNewSlotId, setReschedNewSlotId] = useState("");
  const [reschedDate, setReschedDate] = useState("");
  const [reschedSlots, setReschedSlots] = useState<any[]>([]);
  const [isRescheduleModalOpen, setIsRescheduleModalOpen] = useState(false);

  // 3. Billing Form
  const [billPatientId, setBillPatientId] = useState("");
  const [billDesc, setBillDesc] = useState("");
  const [billDueDate, setBillDueDate] = useState("");
  const [billItems, setBillItems] = useState<BillItem[]>([
    { item_name: "", quantity: 1, unit_price: 0, dosage: "" },
  ]);
  const [focusedMedIndex, setFocusedMedIndex] = useState<number | null>(null);
  const [billAmountPaid, setBillAmountPaid] = useState("");
  const [billPayMode, setBillPayMode] = useState<
    "CASH" | "ONLINE_UPI" | "BANK_TRANSFER"
  >("CASH");
  const [billPayRemarks, setBillPayRemarks] = useState("");
  const [billFile, setBillFile] = useState<File | null>(null);

  // 4. Log Payment Form
  const [payAmount, setPayAmount] = useState("");
  const [payMode, setPayMode] = useState<
    "CASH" | "ONLINE_UPI" | "BANK_TRANSFER"
  >("CASH");
  const [payRemarks, setPayRemarks] = useState("");

  // 5. Medicine Form
  const [medName, setMedName] = useState("");
  const [medPrice, setMedPrice] = useState("");
  const [medStock, setMedStock] = useState("");

  // Pharmacy search/sort
  const [medSearchQuery, setMedSearchQuery] = useState("");
  const [medSortBy, setMedSortBy] = useState<"name" | "stock" | "availability">(
    "name",
  );
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
  const [waTemplates, setWaTemplates] = useState<
    Record<string, { greeting: string; body: string; footer: string }>
  >({
    bill_notification: { greeting: "", body: "", footer: "" },
    overdue_reminder: { greeting: "", body: "", footer: "" },
    prescription_notification: { greeting: "", body: "", footer: "" },
    appointment_reminder: { greeting: "", body: "", footer: "" },
    appointment_confirmation: { greeting: "", body: "", footer: "" },
  });
  const [editingTemplate, setEditingTemplate] = useState<string | null>(null);
  const [templateSaving, setTemplateSaving] = useState(false);

  // Chart Timeframe Selection
  const [patientTimeframe, setPatientTimeframe] = useState<
    "weekly" | "monthly" | "yearly"
  >("weekly");
  const [hoveredData, setHoveredData] = useState<{
    label: string;
    value: number;
    x: number;
    y: number;
  } | null>(null);

  // Toast
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Workspace Switcher & Creation States
  const [isFacilityDropdownOpen, setIsFacilityDropdownOpen] = useState(false);
  const [isCreateWorkspaceOpen, setIsCreateWorkspaceOpen] = useState(false);
  const [newWorkspaceName, setNewWorkspaceName] = useState("");
  const [newWorkspaceType, setNewWorkspaceType] = useState<
    "CLINIC" | "HOSPITAL"
  >("CLINIC");
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [labRequests, setLabRequests] = useState<any[]>([]);
  const [newLabPatientId, setNewLabPatientId] = useState("");
  const [newLabTestName, setNewLabTestName] = useState("");
  const [uploadLabRequestId, setUploadLabRequestId] = useState<number | null>(
    null,
  );
  const [uploadReportUrl, setUploadReportUrl] = useState("");
  const [uploadResultSummary, setUploadResultSummary] = useState("");
  const [isUploadLabOpen, setIsUploadLabOpen] = useState(false);
  const [isRequestLabOpen, setIsRequestLabOpen] = useState(false);

  const [vitalsHistory, setVitalsHistory] = useState<any[]>([]);
  const [vitalsAppointments, setVitalsAppointments] = useState<any[]>([]);
  const [logWeight, setLogWeight] = useState("");
  const [logBP, setLogBP] = useState("");
  const [logHR, setLogHR] = useState("");
  const [logPulse, setLogPulse] = useState("");
  const [logSpO2, setLogSpO2] = useState("");
  const [logTemp, setLogTemp] = useState("");
  const [logEncounterId, setLogEncounterId] = useState("");
  const [logCustomMetrics, setLogCustomMetrics] = useState<
    { key: string; value: string }[]
  >([]);
  const [rxLabRequests, setRxLabRequests] = useState<
    { name: string; value: string }[]
  >([]);
  const [isLogVitalsOpen, setIsLogVitalsOpen] = useState(false);
  const [vitalsPatientId, setVitalsPatientId] = useState("");

  const [inviteEmail, setInviteEmail] = useState("");
  const [invitePhone, setInvitePhone] = useState("");
  const [invitePhoneCode, setInvitePhoneCode] = useState("+91");
  const [inviteRole, setInviteRole] = useState<"DOCTOR" | "PHARMACIST">(
    "DOCTOR",
  );
  const [inviteLink, setInviteLink] = useState("");
  const [inviteOTP, setInviteOTP] = useState("");
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [ownPatientProfile, setOwnPatientProfile] = useState<any>(null);
  const [staffList, setStaffList] = useState<any[]>([]);

  // Clear stale invite state when invite panel opens (Bug 6)
  useEffect(() => {
    if (isInviteOpen) {
      setInviteLink("");
      setInviteOTP("");
    }
  }, [isInviteOpen]);

  // Automatically set selectedDoctorIds to the logged-in doctor if role is DOCTOR when registering a patient
  useEffect(() => {
    if (isAddPatientOpen && doctorInfo?.role === "DOCTOR" && doctorInfo?.id) {
      setSelectedDoctorIds([doctorInfo.id]);
    } else {
      setSelectedDoctorIds([]);
    }
  }, [isAddPatientOpen, doctorInfo]);

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
    // Check for token in URL (from Google OAuth redirect)
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const urlToken = params.get("token");
      if (urlToken) {
        localStorage.setItem("auth_token", urlToken);
        // Remove token from URL for security
        params.delete("token");
        const newUrl =
          window.location.pathname +
          (params.toString() ? "?" + params.toString() : "");
        window.history.replaceState({}, "", newUrl);
      }
    }
    checkAuthSession();
  }, []);

  const checkAuthSession = async () => {
    try {
      const data = await fetchAPI("/api/auth/session");
      if (data.status === "Authenticated") {
        setIsAuthenticated(true);
        setDoctorInfo(data.user);
        if (data.user.active_facility_id) {
          localStorage.setItem(
            "active_facility_id",
            data.user.active_facility_id.toString(),
          );
        }
      } else {
        setIsAuthenticated(false);
        localStorage.removeItem("auth_token");
        router.replace("/signin");
      }
    } catch {
      setIsAuthenticated(false);
      localStorage.removeItem("auth_token");
      router.replace("/signin");
    }
  };

  const urlSyncRef = useRef("");

  const isTabAuthorized = (tab: string, role: string, clinicMode: boolean): boolean => {
    if (role === "USER") {
      return ["appointments", "labs", "billing", "queue", "vitals"].includes(tab);
    }
    if (role === "PHARMACIST") {
      return ["billing", "medicines", "whatsapp"].includes(tab);
    }
    if (role === "HOSPITAL_ADMIN") {
      return [
        "staff",
        "patients",
        "appointments",
        "availability",
        "queue",
        "billing",
        "medicines",
        "analytics",
        "doctor-analytics",
        "reschedule-queue",
        "whatsapp",
      ].includes(tab);
    }
    if (role === "DOCTOR") {
      const doctorTabs = ["patients", "prescriptions", "appointments", "queue", "availability"];
      if (clinicMode) {
        doctorTabs.push("whatsapp");
      }
      return doctorTabs.includes(tab);
    }
    return false;
  };

  // 1. Read URL params on mount and browser back/forward navigation
  useEffect(() => {
    if (!isAuthenticated || !doctorInfo) return;

    const handleUrlChange = () => {
      const params = new URLSearchParams(window.location.search);
      const tab = params.get("tab");
      const view = params.get("view");
      const id = params.get("id");

      if (tab) {
        if (isTabAuthorized(tab, doctorInfo.role, isClinicMode)) {
          const isDoctorInHospital =
            doctorInfo?.role === "DOCTOR" && !isClinicMode;
          if (tab === "whatsapp" && isDoctorInHospital) {
            setActiveTab("patients");
          } else {
            setActiveTab(tab as any);
          }
        }
      }

      if (view === "patient" && id) {
        const patientId = parseInt(id);
        if (!isNaN(patientId)) {
          setViewState({ type: "patient", patientId });
          loadPatientDetails(patientId);
        }
      } else if (view === "patient_vitals" && id) {
        const patientId = parseInt(id);
        if (!isNaN(patientId)) {
          setViewState({ type: "patient_vitals", patientId });
          loadVitals(patientId);
        }
      } else if (view === "bill" && id) {
        const billId = parseInt(id);
        if (!isNaN(billId)) {
          setViewState({ type: "bill", billId });
          loadBillDetails(billId);
        }
      } else {
        setViewState({ type: "list" });
      }
    };

    handleUrlChange();

    window.addEventListener("popstate", handleUrlChange);
    return () => {
      window.removeEventListener("popstate", handleUrlChange);
    };
  }, [isAuthenticated, doctorInfo, isClinicMode]);

  // 2. Write state changes to URL history
  useEffect(() => {
    if (!isAuthenticated) return;

    const params = new URLSearchParams();
    params.set("tab", activeTab);

    if (viewState.type === "patient" && viewState.patientId) {
      params.set("view", "patient");
      params.set("id", viewState.patientId.toString());
    } else if (viewState.type === "patient_vitals" && viewState.patientId) {
      params.set("view", "patient_vitals");
      params.set("id", viewState.patientId.toString());
    } else if (viewState.type === "bill" && viewState.billId) {
      params.set("view", "bill");
      params.set("id", viewState.billId.toString());
    }

    const queryStr = `?${params.toString()}`;
    if (
      window.location.search !== queryStr &&
      urlSyncRef.current !== queryStr
    ) {
      urlSyncRef.current = queryStr;
      window.history.pushState({ tab: activeTab, viewState }, "", queryStr);
    }
  }, [activeTab, viewState, isAuthenticated]);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsFacilityDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // --- Set default tab by role ---
  useEffect(() => {
    if (!isAuthenticated) return;
    if (doctorInfo) {
      // Check if there is a valid deep-linked tab in the URL
      const params = new URLSearchParams(window.location.search);
      const tab = params.get("tab");
      if (tab) {
        if (isTabAuthorized(tab, doctorInfo.role, isClinicMode)) {
          return; // Preserve the URL tab, do not apply default
        }
      }

      if (doctorInfo.role === "USER") {
        setActiveTab("vitals");
      } else if (doctorInfo.role === "HOSPITAL_ADMIN") {
        setActiveTab("staff");
      } else if (doctorInfo.role === "PHARMACIST") {
        setActiveTab("billing");
      } else {
        setActiveTab("patients");
      }
    }
  }, [doctorInfo, isAuthenticated, isClinicMode]);

  // --- Auto-assign in Clinic Mode ---
  useEffect(() => {
    if (isAuthenticated && doctorInfo && isClinicMode) {
      if (doctorInfo.role === "DOCTOR") {
        setApptDoctorId(doctorInfo.id.toString());
        setConfigDoctorId(doctorInfo.id.toString());
      } else if (facilityDoctors.length > 0) {
        setApptDoctorId(facilityDoctors[0].id.toString());
        setConfigDoctorId(facilityDoctors[0].id.toString());
      }
    }
  }, [isAuthenticated, doctorInfo, isClinicMode, facilityDoctors]);

  // --- Load Data Hook ---
  useEffect(() => {
    if (isAuthenticated && doctorInfo) {
      setSelectedDoctorForAnalytics("");
      setDoctorAnalytics(null);
      
      const needsSetup =
        doctorInfo.role === "DOCTOR" &&
        !doctorInfo.specialization &&
        !doctorInfo.location &&
        !doctorInfo.hospital_name;

      if (needsSetup) {
        return; // Don't load dashboard data during onboarding/setup
      }

      if (doctorInfo.role === "USER") {
        loadOwnPatientProfile();
        loadAppointments();
        loadRecentBills();
      } else {
        loadPatients();
        loadFacilityDoctors();
        loadAppointments();
        loadMedicines();
        loadPrescriptions();
        if (
          doctorInfo.role === "PHARMACIST" ||
          doctorInfo.role === "HOSPITAL_ADMIN"
        ) {
          loadPendingPrescriptions();
        }
        loadAnalytics();
        loadRecentBills();
        loadWhatsAppTemplates();
        loadStaff();
      }
    }
  }, [isAuthenticated, doctorInfo]);

  // Reactively load slots/availability/reschedules when tabs change
  useEffect(() => {
    if (!isAuthenticated) return;
    if (
      activeTab === "reschedule-queue" &&
      doctorInfo?.role === "HOSPITAL_ADMIN"
    ) {
      loadRescheduleQueue();
    }
    if (activeTab === "availability" && doctorInfo) {
      if (doctorInfo.role === "DOCTOR") {
        setConfigDoctorId(doctorInfo.id.toString());
        loadDoctorAvailability(doctorInfo.id.toString());
      } else {
        setConfigDoctorId("");
      }
    }
  }, [activeTab, doctorInfo, isAuthenticated]);

  // Keep details updated
  useEffect(() => {
    if (!isAuthenticated) return;
    if (viewState.type === "patient") {
      loadPatientDetails(viewState.patientId);
    } else if (viewState.type === "bill") {
      loadBillDetails(viewState.billId);
    }
  }, [viewState, isAuthenticated]);

  // Load patient's latest prescription charges and pre-populate consultation fee when billPatientId changes
  useEffect(() => {
    if (!billPatientId) return;
    const fetchPatientData = async () => {
      try {
        const data = await fetchAPI(`/api/patients/detail?id=${billPatientId}`);
        if (data && data.prescriptions && data.prescriptions.length > 0) {
          // Find the latest prescription
          const latestRx = data.prescriptions[0];
          // Pre-populate diagnosis/bill name
          if (latestRx.diagnosis) {
            setBillDesc(latestRx.diagnosis);
          }
          // Pre-populate consultation fee row
          const consultationFee = latestRx.consultation_charges || 0;
          if (consultationFee > 0) {
            setBillItems([
              {
                item_name: "Consultation Fee (from Rx)",
                quantity: 1,
                unit_price: consultationFee,
                dosage: "",
              },
            ]);
            // If they also paid some amount upfront at prescription time
            if (latestRx.amount_paid > 0) {
              setBillAmountPaid(latestRx.amount_paid.toString());
            } else {
              setBillAmountPaid("");
            }
          } else {
            setBillItems([
              { item_name: "", quantity: 1, unit_price: 0, dosage: "" },
            ]);
            setBillAmountPaid("");
          }
        } else {
          setBillDesc("");
          setBillItems([
            { item_name: "", quantity: 1, unit_price: 0, dosage: "" },
          ]);
          setBillAmountPaid("");
        }
      } catch (err) {
        console.error("Failed to load patient prescriptions for billing", err);
      }
    };
    fetchPatientData();
  }, [billPatientId]);

  // --- API Loaders ---
  const loadVitals = async (ptId: number) => {
    try {
      const data = await fetchAPI(`/api/vitals?patient_id=${ptId}`);
      setVitalsHistory(data || []);
    } catch (e) {
      console.error("Failed to load vitals", e);
    }
  };

  const loadVitalsPatientAppointments = async (ptId: number) => {
    try {
      const data = await fetchAPI(`/api/patients/detail?id=${ptId}`);
      if (data && data.appointments) {
        setVitalsAppointments(data.appointments);
      } else {
        setVitalsAppointments([]);
      }
    } catch (e) {
      console.error("Failed to load patient appointments for vitals", e);
      setVitalsAppointments([]);
    }
  };

  const loadLabRequests = async (ptId: number) => {
    try {
      const data = await fetchAPI(`/api/labs?patient_id=${ptId}`);
      setLabRequests(data || []);
    } catch (e) {
      console.error("Failed to load lab requests", e);
    }
  };

  const loadOwnPatientProfile = async () => {
    try {
      const data = await fetchAPI("/api/patients/detail");
      setOwnPatientProfile(data);
      if (data?.patient?.id) {
        loadVitals(data.patient.id);
        loadLabRequests(data.patient.id);
      }
    } catch (e) {
      console.error("Failed to load patient profile", e);
    }
  };

  const loadPatients = async () => {
    try {
      const url = isDoctorInHospital
        ? "/api/patients?treated_only=true"
        : "/api/patients";
      const data = await fetchAPI(url);
      setPatients(data || []);
    } catch (e) {
      console.error("Failed to load patients", e);
    }
  };

  const loadFacilityDoctors = async () => {
    try {
      const data = await fetchAPI("/api/facility/doctors");
      setFacilityDoctors(data || []);
    } catch (e) {
      console.error("Failed to load facility doctors", e);
    }
  };

  const loadPrescriptions = async () => {
    try {
      const data = await fetchAPI("/api/prescriptions");
      setPrescriptions(data || []);
    } catch (e) {
      console.error("Failed to load prescriptions", e);
    }
  };

  const loadPendingPrescriptions = async () => {
    try {
      const data = await fetchAPI("/api/pharmacy/queue");
      setPendingPrescriptions(data || []);
    } catch (e) {
      console.error("Failed to load pharmacy queue", e);
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

  const loadRescheduleQueue = async () => {
    try {
      const data = await fetchAPI("/api/reschedule-queue");
      setRescheduleQueue(data || []);
    } catch (e) {
      console.error("Failed to load reschedule queue", e);
    }
  };

  const loadDoctorAvailability = async (docId: string) => {
    if (!docId) return;
    try {
      const data = await fetchAPI(
        `/api/doctors/availability?doctor_id=${docId}`,
      );
      if (data && data.length > 0) {
        const newAvail = Array.from({ length: 7 }, (_, i) => {
          const matched = data.find((d: any) => d.day_of_week === i);
          return matched
            ? {
                day_of_week: i,
                start_time: matched.start_time.substring(0, 5),
                end_time: matched.end_time.substring(0, 5),
                slot_duration_minutes: matched.slot_duration_minutes,
                max_patients_per_slot: matched.max_patients_per_slot,
                is_active: matched.is_active,
              }
            : {
                day_of_week: i,
                start_time: "09:00",
                end_time: "17:00",
                slot_duration_minutes: 60,
                max_patients_per_slot: 1,
                is_active: false,
              };
        });
        setConfigWeeklyAvail(newAvail);
      } else {
        setConfigWeeklyAvail(
          Array.from({ length: 7 }, (_, i) => ({
            day_of_week: i,
            start_time: "09:00",
            end_time: "17:00",
            slot_duration_minutes: 60,
            max_patients_per_slot: 1,
            is_active: false,
          })),
        );
      }
    } catch (e) {
      console.error("Failed to load availability", e);
    }
  };

  const fetchAvailableSlots = async (docId: string, date: string) => {
    if (!docId || !date) return;
    try {
      const data = await fetchAPI(`/api/slots?doctor_id=${docId}&date=${date}`);
      setAvailableSlots(data || []);
    } catch (e) {
      console.error("Failed to load slots", e);
    }
  };

  const fetchRescheduleSlots = async (docId: string, date: string) => {
    if (!docId || !date) return;
    try {
      const data = await fetchAPI(`/api/slots?doctor_id=${docId}&date=${date}`);
      setReschedSlots(data || []);
    } catch (e) {
      console.error("Failed to load reschedule slots", e);
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

  const loadDoctorAnalytics = async (doctorId: string) => {
    if (!doctorId) {
      setDoctorAnalytics(null);
      return;
    }
    setLoadingDoctorAnalytics(true);
    try {
      const data = await fetchAPI(`/api/analytics?doctor_id=${doctorId}`);
      setDoctorAnalytics(data);
    } catch (e) {
      console.error("Failed to load doctor analytics", e);
      setToast({ message: "Failed to load doctor analytics", type: "error" });
    } finally {
      setLoadingDoctorAnalytics(false);
    }
  };

  const loadStaff = async () => {
    try {
      const data = await fetchAPI("/api/facilities/staff");
      setStaffList(data || []);
    } catch (e) {
      console.error("Failed to load staff list", e);
    }
  };

  const loadPatientDetails = async (id: number) => {
    try {
      const data = await fetchAPI(`/api/patients/detail?id=${id}`);
      setCurrentPatientData({
        patient: data.patient,
        contracts: data.contracts || [],
        appointments: data.appointments || [],
        prescriptions: data.prescriptions || [],
      });
      loadLabRequests(id);
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
        setViewState({
          type: "patient",
          patientId: currentPatientData.patient.id,
        });
      } else {
        setViewState({ type: "list" });
      }
    }
  };

  // Load recent bills
  const loadRecentBills = async (search = "", offset = 0, append = false) => {
    setBillsLoading(true);
    try {
      const data = await fetchAPI(
        `/api/bills?search=${encodeURIComponent(search)}&offset=${offset}&limit=20`,
      );
      if (append) {
        setRecentBills((prev) => [...prev, ...(data.bills || [])]);
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
      setDoctorInfo((prev) =>
        prev
          ? {
              ...prev,
              name: editDoctorName.trim(),
              clinic_name: editClinicName.trim() || "My Clinic",
            }
          : null,
      );
      setIsEditingProfile(false);
      setToast({ message: "Profile updated successfully", type: "success" });
    } catch {
      setToast({ message: "Failed to update profile", type: "error" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSwitchFacility = async (facilityId: number) => {
    try {
      localStorage.setItem("active_facility_id", facilityId.toString());
      setToast({ message: "Switching workspace...", type: "success" });
      await checkAuthSession();
    } catch (e) {
      console.error("Failed to switch facility", e);
      setToast({ message: "Failed to switch workspace", type: "error" });
    }
  };

  const handleCreateWorkspace = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWorkspaceName.trim()) {
      setToast({ message: "Workspace name is required", type: "error" });
      return;
    }
    setIsSubmitting(true);
    try {
      const response = await fetchAPI("/api/facilities", {
        method: "POST",
        body: JSON.stringify({
          name: newWorkspaceName.trim(),
          type: newWorkspaceType,
        }),
      });
      setToast({ message: "Workspace created successfully!", type: "success" });
      setNewWorkspaceName("");
      setIsCreateWorkspaceOpen(false);
      if (response && response.id) {
        localStorage.setItem("active_facility_id", response.id.toString());
      }
      await checkAuthSession();
    } catch (err: any) {
      console.error("Failed to create workspace", err);
      setToast({
        message: err.message || "Failed to create workspace",
        type: "error",
      });
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
        prescription_notification: {
          greeting: data.prescription_notification?.greeting || "",
          body: data.prescription_notification?.body || "",
          footer: data.prescription_notification?.footer || "",
        },
        appointment_reminder: {
          greeting: data.appointment_reminder?.greeting || "",
          body: data.appointment_reminder?.body || "",
          footer: data.appointment_reminder?.footer || "",
        },
        appointment_confirmation: {
          greeting: data.appointment_confirmation?.greeting || "",
          body: data.appointment_confirmation?.body || "",
          footer: data.appointment_confirmation?.footer || "",
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
      localStorage.removeItem("auth_token");
      localStorage.removeItem("active_facility_id");
      setIsAuthenticated(false);
      router.replace("/");
    } catch (e) {
      console.error("Logout failed", e);
      localStorage.removeItem("auth_token");
      localStorage.removeItem("active_facility_id");
      router.replace("/");
    }
  };

  const handleDispensePrescription = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeRxToDispense || dispenseItems.length === 0) return;
    if (isSubmitting) return;
    setIsSubmitting(true);

    try {
      await fetchAPI("/api/pharmacy/dispense", {
        method: "POST",
        body: JSON.stringify({
          prescription_id: activeRxToDispense.id,
          amount_paid: parseFloat(dispenseAmountPaid) || 0,
          items: dispenseItems.map((item) => ({
            prescription_item_id: item.prescription_item_id,
            medicine_id: item.medicine_id,
            tablets_given: parseInt(item.tablets_given) || 0,
            cost_per_tablet: parseFloat(item.cost_per_tablet) || 0,
            is_nil: item.is_nil,
            nil_reason: item.nil_reason,
          })),
        }),
      });
      setToast({
        message: "Medication dispensed and bill generated!",
        type: "success",
      });
      setActiveRxToDispense(null);
      setDispenseItems([]);
      setDispenseAmountPaid("");
      loadPendingPrescriptions();
      loadRecentBills();
      loadPrescriptions();
      loadPatients();
      if (currentPatientData) {
        loadPatientDetails(currentPatientData.patient.id);
      }
    } catch (e: any) {
      setToast({
        message: e.message || "Failed to dispense medication",
        type: "error",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAddPrescription = async (e: React.FormEvent) => {
    e.preventDefault();
    const activeLabRequests = rxLabRequests
      .filter((l) => l.name.trim() !== "")
      .map((l) =>
        l.value.trim() !== ""
          ? `${l.name.trim()}: ${l.value.trim()}`
          : l.name.trim(),
      );
    const activeMedItems = rxItems.filter(
      (item) => item.medicine_name.trim() !== "",
    );
    if (
      !rxPatientId ||
      (activeMedItems.length === 0 && activeLabRequests.length === 0)
    ) {
      setToast({
        message: "Please add at least one medicine or one lab request",
        type: "error",
      });
      return;
    }

    // Check for duplicate test names
    const seenLabs = new Set<string>();
    for (const test of rxLabRequests) {
      if (test.name.trim() === "") continue;
      const normalized = test.name.trim().toLowerCase();
      if (seenLabs.has(normalized)) {
        setToast({
          message: `Duplicate lab request name "${test.name}" detected! Please use descriptive, distinct names (e.g., "X-Ray Chest" and "X-Ray Spine") as identical names will be dropped.`,
          type: "error",
        });
        return;
      }
      seenLabs.add(normalized);
    }

    if (isSubmitting) return;
    setIsSubmitting(true);

    try {
      const res = await fetchAPI("/api/prescriptions", {
        method: "POST",
        body: JSON.stringify({
          patient_id: parseInt(rxPatientId),
          diagnosis: rxDiagnosis,
          notes: rxNotes,
          items: activeMedItems.map((item) => ({
            ...item,
            quantity: parseInt(item.quantity) || 0,
            medicine_id: item.medicine_id ? parseInt(item.medicine_id) : null,
          })),
          lab_requests: activeLabRequests,
          visit_charges: rxVisitCharges ? parseFloat(rxVisitCharges) : 0,
          amount_paid:
            isClinicMode && rxAmountPaid ? parseFloat(rxAmountPaid) : 0,
        }),
      });

      if (res.id) {
        try {
          const patient = patients.find((p) => p.id.toString() === rxPatientId);
          const patientName = patient ? patient.name : "Patient";
          const patientPhone = patient ? patient.phone : "";
          const patientGender = patient ? patient.gender : "";
          const patientAge = patient ? patient.age : "";

          const rxDetail = {
            id: res.id,
            patient_name: patientName,
            patient_phone: patientPhone,
            patient_gender: patientGender,
            patient_age: patientAge,
            diagnosis: rxDiagnosis,
            notes: rxNotes,
            items: activeMedItems,
            lab_requests: activeLabRequests,
            created_at: new Date().toISOString(),
            weight: rxWeight || "",
            bp: rxBP || "",
            pulse: rxPulse || "",
            temp: rxTemp || "",
          };
          const rxDoc = await buildPrescriptionPDF(rxDetail);
          const rxBlob = rxDoc.output("blob");

          const uploadForm = new FormData();
          uploadForm.append("prescription_id", res.id.toString());
          uploadForm.append(
            "prescription",
            rxBlob,
            `Prescription_${patientName.replace(/\s+/g, "_")}_${res.id}.pdf`,
          );

          if (res.bill_id && rxVisitCharges) {
            const chargesAmount = parseFloat(rxVisitCharges);
            const paidAmount = rxAmountPaid ? parseFloat(rxAmountPaid) : 0;
            const balance = Math.max(0, chargesAmount - paidAmount);
            const billDetail = {
              bill: {
                id: res.bill_id,
                patient_id: parseInt(rxPatientId),
                patient_name: patientName,
                patient_phone: patientPhone,
                patient_gender: patientGender,
                patient_age: patientAge,
                doctor_id: doctorInfo?.id || 0,
                clinic_name: doctorInfo?.clinic_name || "ClinicFlow",
                description: "Consultation / Visit Charges",
                total_amount: chargesAmount,
                remaining_amount: balance,
                status: (balance <= 0
                  ? "SETTLED"
                  : paidAmount > 0
                    ? "PARTIALLY_PAID"
                    : "PENDING") as "PENDING" | "PARTIALLY_PAID" | "SETTLED",
                promised_due_date: null,
                invoice_url: null,
                notified: false,
                created_at: new Date().toISOString(),
                weight: rxWeight || "",
                bp: rxBP || "",
                pulse: rxPulse || "",
                temp: rxTemp || "",
              },
              items: [
                {
                  item_name: "Consultation Fee",
                  quantity: 1,
                  unit_price: parseFloat(rxVisitCharges),
                  dosage: "",
                },
              ],
              payments:
                rxAmountPaid && parseFloat(rxAmountPaid) > 0
                  ? [
                      {
                        id: 0,
                        contract_id: res.bill_id,
                        amount_paid: parseFloat(rxAmountPaid),
                        payment_mode: "CASH",
                        remarks: "Paid on visit",
                        payment_date: new Date().toISOString(),
                      },
                    ]
                  : [],
            };
            const { buildInvoicePDF } = await import("./utils/pdfHelper");
            const billDoc = await buildInvoicePDF(billDetail, doctorInfo, facilityDoctors);
            const billBlob = billDoc.output("blob");
            uploadForm.append("bill_id", res.bill_id.toString());
            uploadForm.append(
              "invoice",
              billBlob,
              `Invoice_${patientName.replace(/\s+/g, "_")}_${res.bill_id}.pdf`,
            );
          }

          await fetchAPI("/api/prescriptions/upload-pdf", {
            method: "POST",
            body: uploadForm,
          });
        } catch (uploadErr) {
          console.error(
            "Failed to generate/upload prescription/bill PDF documents:",
            uploadErr,
          );
        }
      }

      // Automatically log vitals if any vitals field was filled
      const savedPatientId = parseInt(rxPatientId);
      const hasVitals = rxWeight || rxBP || rxHR || rxPulse || rxSpO2 || rxTemp;
      if (hasVitals) {
        try {
          await fetchAPI("/api/vitals", {
            method: "POST",
            body: JSON.stringify({
              patient_id: savedPatientId,
              weight_kg: rxWeight ? parseFloat(rxWeight) : null,
              blood_pressure: rxBP || null,
              heart_rate: rxHR
                ? parseInt(rxHR)
                : rxPulse
                  ? parseInt(rxPulse)
                  : 0,
              pulse: rxPulse ? parseInt(rxPulse) : null,
              spo2: rxSpO2 ? parseInt(rxSpO2) : null,
              temperature: rxTemp ? parseFloat(rxTemp) : null,
            }),
          });
        } catch (vitalsErr) {
          console.error("Failed to log vitals from prescription:", vitalsErr);
        }
      }

      setToast({
        message: "Prescription written successfully",
        type: "success",
      });
      setRxPatientId("");
      setRxDiagnosis("");
      setRxNotes("");
      setRxVisitCharges("");
      setRxAmountPaid("");
      setRxWeight("");
      setRxBP("");
      setRxHR("");
      setRxPulse("");
      setRxSpO2("");
      setRxTemp("");
      setRxItems([
        {
          medicine_name: "",
          medicine_id: null,
          dosage: "",
          frequency: "",
          duration: "",
          quantity: 1,
          instructions: "",
        },
      ]);
      setRxLabRequests([]);
      setIsAddRxOpen(false);
      loadPrescriptions();
      loadPatients();
      if (
        currentPatientData &&
        currentPatientData.patient.id === savedPatientId
      ) {
        loadPatientDetails(savedPatientId);
      }
    } catch {
      setToast({ message: "Failed to write prescription", type: "error" });
    } finally {
      setIsSubmitting(false);
    }
  };

  // --- Handlers ---
  const handleAddPatient = async (e: React.FormEvent) => {
    e.preventDefault();
    const combinedPhone = getCombinedPhone(newPtPhoneCode, newPtPhone);
    if (!newPtName || !newPtPhone) return;
    if (isSubmitting) return;
    setIsSubmitting(true);

    try {
      await fetchAPI("/api/patients", {
        method: "POST",
        body: JSON.stringify({
          name: newPtName,
          phone: combinedPhone,
          gender: newPtGender,
          age: parseInt(newPtAge) || 0,
          medical_history: newPtHistory,
          doctor_ids: selectedDoctorIds,
        }),
      });
      setToast({ message: "Patient registered successfully", type: "success" });
      setNewPtName("");
      setNewPtPhone("");
      setNewPtPhoneCode("+91");
      setNewPtAge("");
      setNewPtHistory("");
      setSelectedDoctorIds([]);
      setIsAddPatientOpen(false);
      loadPatients();
    } catch (e: any) {
      setToast({
        message: e.message || "Failed to register patient",
        type: "error",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeletePatient = async (id: number) => {
    if (
      !window.confirm(
        "Are you sure you want to delete this patient? This will cascade and delete all associated records (appointments, prescriptions, vitals, etc.).",
      )
    ) {
      return;
    }
    try {
      await fetchAPI(`/api/patients?id=${id}`, {
        method: "DELETE",
      });
      setToast({ message: "Patient deleted successfully", type: "success" });
      loadPatients();
    } catch (e: any) {
      setToast({
        message: e.message || "Failed to delete patient",
        type: "error",
      });
    }
  };

  const handleRemoveStaff = async (id: number) => {
    if (
      !window.confirm(
        "Are you sure you want to remove this staff member from this workspace? They will lose all access and visibility to this hospital/clinic workspace.",
      )
    ) {
      return;
    }
    try {
      await fetchAPI(`/api/facilities/staff?id=${id}`, {
        method: "DELETE",
      });
      setToast({
        message: "Staff member removed from workspace successfully",
        type: "success",
      });
      loadStaff();
    } catch (e: any) {
      setToast({
        message: e.message || "Failed to remove staff member",
        type: "error",
      });
    }
  };

  const handleAddAppointment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!apptSlotId) {
      setToast({ message: "Please select an available slot", type: "error" });
      return;
    }
    if (doctorInfo?.role !== "USER" && !apptPatientId) {
      setToast({ message: "Please select a patient", type: "error" });
      return;
    }
    if (isSubmitting) return;
    setIsSubmitting(true);

    try {
      await fetchAPI("/api/appointments", {
        method: "POST",
        body: JSON.stringify({
          patient_id: apptPatientId ? parseInt(apptPatientId) : 0,
          slot_id: parseInt(apptSlotId),
          reason: apptReason,
        }),
      });
      setToast({
        message: "Appointment booked successfully!",
        type: "success",
      });
      setApptPatientId("");
      setApptDoctorId("");
      setApptSlotId("");
      setApptDate("");
      setApptReason("");
      setAvailableSlots([]);
      setIsAddAppointmentOpen(false);
      loadAppointments();
      loadAnalytics();
    } catch (err: any) {
      setToast({
        message: err.message || "Failed to book appointment",
        type: "error",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleAppointmentStatus = async (id: number, currentStatus: string) => {
    const nextStatus = currentStatus === "PENDING" ? "COMPLETED" : "PENDING";
    try {
      await fetchAPI("/api/appointments/status", {
        method: "PUT",
        body: JSON.stringify({ id, status: nextStatus }),
      });
      setToast({
        message: `Slot status updated to ${nextStatus}`,
        type: "success",
      });
      loadAppointments();
      loadAnalytics();
      if (viewState.type === "patient") {
        loadPatientDetails(viewState.patientId);
      }
    } catch {
      setToast({ message: "Failed to update appointment", type: "error" });
    }
  };

  const handleBillItemChange = (
    index: number,
    field: keyof BillItem,
    value: any,
  ) => {
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
    setBillItems([
      ...billItems,
      { item_name: "", quantity: 1, unit_price: 0, dosage: "" },
    ]);
  };

  const removeBillItemRow = (index: number) => {
    if (billItems.length > 1) {
      setBillItems(billItems.filter((_, idx) => idx !== index));
    }
  };

  const getBillTotal = () => {
    return billItems.reduce(
      (sum, item) => sum + item.quantity * item.unit_price,
      0,
    );
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
      } else {
        formData.append("skip_whatsapp", "true");
      }

      const res = await fetchAPI("/api/bills", {
        method: "POST",
        body: formData,
      });

      if (!billFile && res.bill_id) {
        try {
          const patient = patients.find(
            (p) => p.id.toString() === billPatientId,
          );
          const patientName = patient ? patient.name : "Patient";
          const patientPhone = patient ? patient.phone : "";
          const detail: BillDetail = {
            bill: {
              id: res.bill_id,
              patient_id: parseInt(billPatientId),
              patient_name: patientName,
              patient_phone: patientPhone,
              patient_gender: patient ? patient.gender : "",
              patient_age: patient ? patient.age : 0,
              doctor_id: 0,
              clinic_name: doctorInfo?.clinic_name || "ClinicFlow",
              description: billDesc,
              total_amount: res.total_amount,
              remaining_amount: res.remaining_amount,
              status: res.status,
              promised_due_date: billDueDate,
              invoice_url: null,
              created_at: res.created_at || new Date().toISOString(),
              notified: false,
            },
            items: billItems.map((item, index) => ({
              id: index,
              bill_id: res.bill_id,
              item_name: item.item_name,
              quantity: item.quantity,
              unit_price: item.unit_price,
              dosage: item.dosage,
            })),
            payments: billAmountPaid
              ? [
                  {
                    id: 0,
                    contract_id: res.bill_id,
                    amount_paid: parseFloat(billAmountPaid),
                    payment_mode: billPayMode,
                    remarks: billPayRemarks,
                    payment_date: res.created_at || new Date().toISOString(),
                  },
                ]
              : [],
          };

          const { buildInvoicePDF } = await import("./utils/pdfHelper");
          const doc = await buildInvoicePDF(detail, doctorInfo, facilityDoctors);
          const pdfBlob = doc.output("blob");

          const uploadForm = new FormData();
          uploadForm.append("bill_id", res.bill_id.toString());
          uploadForm.append(
            "invoice",
            pdfBlob,
            `Invoice_${patientName.replace(/\s+/g, "_")}_${res.bill_id}.pdf`,
          );

          await fetchAPI("/api/bills/upload-invoice", {
            method: "POST",
            body: uploadForm,
          });
        } catch (uploadErr) {
          console.error(
            "Failed to upload auto-generated invoice PDF:",
            uploadErr,
          );
        }
      }

      setToast({
        message: "Bill created and WhatsApp receipt sent successfully!",
        type: "success",
      });
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
        setActiveTab("patients");
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
          remarks: payRemarks,
        }),
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
          stock: parseInt(medStock) || 0,
        }),
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

  const buildPrescriptionPDF = async (rx: any): Promise<any> => {
    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF();

    const formattedDate = rx.created_at
      ? new Date(rx.created_at).toLocaleDateString()
      : new Date().toLocaleDateString();

    let rxY = 78;

    const addNewPrescriptionPage = () => {
      doc.addPage();
      
      // Draw top header box
      doc.setDrawColor(148, 163, 184);
      doc.setLineWidth(0.5);
      doc.roundedRect(15, 15, 180, 42, 4, 4, "S");

      // Hospital Name / Clinic Name
      doc.setFont("helvetica", "bold");
      doc.setFontSize(16);
      doc.setTextColor(30, 41, 59);
      doc.text(doctorInfo?.clinic_name || "ClinicFlow Hospital", 105, 25, {
        align: "center",
      });

      // Row 1 metadata
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(71, 85, 105);

      doc.setFont("helvetica", "bold");
      doc.text("Name:", 20, 36);
      doc.setFont("helvetica", "normal");
      doc.text(rx.patient_name || "N/A", 35, 36);

      doc.setFont("helvetica", "bold");
      doc.text("Gender:", 90, 36);
      doc.setFont("helvetica", "normal");
      doc.text(rx.patient_gender || "N/A", 108, 36);

      doc.setFont("helvetica", "bold");
      doc.text("Date:", 145, 36);
      doc.setFont("helvetica", "normal");
      doc.text(formattedDate, 158, 36);

      // Row 2 metadata
      doc.setFont("helvetica", "bold");
      doc.text("Age:", 20, 46);
      doc.setFont("helvetica", "normal");
      doc.text(rx.patient_age ? rx.patient_age.toString() : "N/A", 35, 46);

      doc.setFont("helvetica", "bold");
      doc.text("Weight:", 90, 46);
      doc.setFont("helvetica", "normal");
      doc.text(rx.weight ? `${rx.weight} kg` : "N/A", 108, 46);

      doc.setFont("helvetica", "bold");
      doc.text("B/P:", 145, 46);
      doc.setFont("helvetica", "normal");
      doc.text(rx.bp || "N/A", 158, 46);

      // Draw Left Box (Staff)
      doc.setDrawColor(148, 163, 184);
      doc.setLineWidth(0.5);
      doc.roundedRect(15, 62, 55, 215, 4, 4, "S");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.setTextColor(30, 41, 59);
      doc.text("Staff:", 20, 70);

      // Draw Right Box (Prescriptions)
      doc.roundedRect(75, 62, 120, 215, 4, 4, "S");
      doc.text("Prescriptions (Contd.):", 80, 70);

      rxY = 78;
    };

    // Draw top header box (Page 1)
    doc.setDrawColor(148, 163, 184);
    doc.setLineWidth(0.5);
    doc.roundedRect(15, 15, 180, 42, 4, 4, "S");

    // Hospital Name / Clinic Name
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(30, 41, 59);
    doc.text(doctorInfo?.clinic_name || "ClinicFlow Hospital", 105, 25, {
      align: "center",
    });

    // Row 1 metadata
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(71, 85, 105);

    doc.setFont("helvetica", "bold");
    doc.text("Name:", 20, 36);
    doc.setFont("helvetica", "normal");
    doc.text(rx.patient_name || "N/A", 35, 36);

    doc.setFont("helvetica", "bold");
    doc.text("Gender:", 90, 36);
    doc.setFont("helvetica", "normal");
    doc.text(rx.patient_gender || "N/A", 108, 36);

    doc.setFont("helvetica", "bold");
    doc.text("Date:", 145, 36);
    doc.setFont("helvetica", "normal");
    doc.text(formattedDate, 158, 36);

    // Row 2 metadata
    doc.setFont("helvetica", "bold");
    doc.text("Age:", 20, 46);
    doc.setFont("helvetica", "normal");
    doc.text(rx.patient_age ? rx.patient_age.toString() : "N/A", 35, 46);

    doc.setFont("helvetica", "bold");
    doc.text("Weight:", 90, 46);
    doc.setFont("helvetica", "normal");
    doc.text(rx.weight ? `${rx.weight} kg` : "N/A", 108, 46);

    doc.setFont("helvetica", "bold");
    doc.text("B/P:", 145, 46);
    doc.setFont("helvetica", "normal");
    doc.text(rx.bp || "N/A", 158, 46);

    // Draw Left Box (Staff)
    doc.roundedRect(15, 62, 55, 215, 4, 4, "S");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(30, 41, 59);
    doc.text("Staff:", 20, 70);

    // List other doctors in the left column
    doc.setFontSize(9);
    let staffY = 78;
    const currentDoctorId = doctorInfo?.id;
    const otherDocs = facilityDoctors.filter(
      (doc: any) => doc.id !== currentDoctorId,
    );

    if (otherDocs.length > 0) {
      otherDocs.forEach((d: any) => {
        if (staffY > 260) return; // Page boundary check
        doc.setFont("helvetica", "bold");
        doc.setTextColor(51, 65, 85);
        const nameLines = doc.splitTextToSize(`Dr. ${d.name}`, 45);
        nameLines.forEach((line: string) => {
          doc.text(line, 20, staffY);
          staffY += 4.5;
        });

        doc.setFont("helvetica", "italic");
        doc.setTextColor(100, 116, 139);
        const specLines = doc.splitTextToSize(
          d.specialization || "General Medicine",
          45,
        );
        specLines.forEach((line: string) => {
          doc.text(line, 20, staffY);
          staffY += 4.5;
        });
        staffY += 4; // Space between doctors
      });
    } else {
      doc.setFont("helvetica", "normal");
      doc.setTextColor(148, 163, 184);
      doc.text("No other doctors", 20, staffY);
    }

    // Draw Right Box (Prescriptions)
    doc.roundedRect(75, 62, 120, 215, 4, 4, "S");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(30, 41, 59);
    doc.text("Prescriptions:", 80, 70);

    doc.setFontSize(10);

    // Diagnosis
    doc.setFont("helvetica", "bold");
    doc.text("Diagnosis:", 80, rxY);
    doc.setFont("helvetica", "normal");
    doc.text(rx.diagnosis || "N/A", 105, rxY);
    rxY += 8;

    // Vitals if present (Pulse, Temp, SpO2, Heart Rate)
    const hasVitals = rx.pulse || rx.temp || rx.spo2;
    if (hasVitals) {
      doc.setFont("helvetica", "bold");
      doc.text("Vitals:", 80, rxY);
      doc.setFont("helvetica", "normal");
      let vitalsText = "";
      if (rx.pulse) vitalsText += `Pulse: ${rx.pulse} bpm   `;
      if (rx.temp) vitalsText += `Temp: ${rx.temp}°F   `;
      if (rx.spo2) vitalsText += `SpO2: ${rx.spo2}%`;
      doc.text(vitalsText, 95, rxY);
      rxY += 8;
    }

    // Medicines List
    if (rx.items && rx.items.length > 0) {
      if (rxY > 255) {
        addNewPrescriptionPage();
      }
      doc.setFont("helvetica", "bold");
      doc.setTextColor(79, 70, 229);
      doc.text("Prescribed Medicines:", 80, rxY);
      rxY += 6;

      rx.items.forEach((item: any, index: number) => {
        if (rxY > 250) {
          addNewPrescriptionPage();
        }
        doc.setFont("helvetica", "bold");
        doc.setTextColor(51, 65, 85);
        doc.text(`${index + 1}. ${item.medicine_name}`, 82, rxY);
        rxY += 5;

        doc.setFont("helvetica", "normal");
        doc.setTextColor(71, 85, 105);
        doc.setFontSize(9);
        let detailText = `Dosage: ${item.dosage || "N/A"}  |  Freq: ${item.frequency || "N/A"}  |  Dur: ${item.duration || "N/A"}  |  Qty: ${item.quantity || 1}`;
        doc.text(detailText, 85, rxY);
        rxY += 4.5;

        if (item.instructions) {
          if (rxY > 260) {
            addNewPrescriptionPage();
          }
          doc.setFont("helvetica", "italic");
          doc.text(`Instructions: ${item.instructions}`, 85, rxY);
          rxY += 5;
        }
        rxY += 1.5;
        doc.setFontSize(10);
      });
      rxY += 3;
    }

    // Recommended Lab tests
    if (rx.lab_requests && rx.lab_requests.length > 0) {
      if (rxY > 255) {
        addNewPrescriptionPage();
      }
      doc.setFont("helvetica", "bold");
      doc.setTextColor(79, 70, 229);
      doc.text("Recommended Lab/Diagnostic Tests:", 80, rxY);
      rxY += 6;

      doc.setFont("helvetica", "normal");
      doc.setTextColor(51, 65, 85);
      rx.lab_requests.forEach((test: string) => {
        if (rxY > 260) {
          addNewPrescriptionPage();
        }
        doc.text(`• ${test}`, 85, rxY);
        rxY += 5.5;
      });
      rxY += 3;
    }

    // Clinical Notes / Advice
    if (rx.notes) {
      if (rxY > 255) {
        addNewPrescriptionPage();
      }
      doc.setFont("helvetica", "bold");
      doc.setTextColor(79, 70, 229);
      doc.text("Clinical Notes / Advice:", 80, rxY);
      rxY += 6;

      doc.setFont("helvetica", "normal");
      doc.setTextColor(51, 65, 85);
      const lines = doc.splitTextToSize(rx.notes, 110);
      lines.forEach((line: string) => {
        if (rxY > 260) {
          addNewPrescriptionPage();
        }
        doc.text(line, 82, rxY);
        rxY += 5.5;
      });
    }

    return doc;
  };

  const generateInvoicePDF = async (detail: BillDetail) => {
    const { generateInvoicePDF: helperGenerate } = await import("./utils/pdfHelper");
    await helperGenerate(detail, doctorInfo, facilityDoctors);
  };

  // --- SVG Charts Draw Helpers ---
  const renderHistogram = (dataPoints: DataPoint[]) => {
    if (!dataPoints || dataPoints.length === 0) return null;
    const maxVal = Math.max(...dataPoints.map((d) => d.value), 1);
    const width = 500;
    const height = 200;
    const padding = 30;
    const chartW = width - padding * 2;
    const chartH = height - padding * 2;
    const colWidth = chartW / dataPoints.length;

    return (
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-full text-slate-400/50"
      >
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
              <line
                x1={padding}
                y1={yPos}
                x2={width - padding}
                y2={yPos}
                stroke="currentColor"
                strokeOpacity="0.1"
                strokeDasharray="3,3"
              />
              <text
                x={padding - 5}
                y={yPos + 4}
                textAnchor="end"
                fontSize="9"
                className="fill-slate-500 dark:fill-white font-semibold"
              >
                {gridVal}
              </text>
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
                  setHoveredData({
                    label: dp.label,
                    value: dp.value,
                    x: rect.left + window.scrollX + barW / 2,
                    y: rect.top + window.scrollY - 10,
                  });
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
    const maxVal = Math.max(...dataPoints.map((d) => d.value), 100);
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
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-full text-slate-400/50"
      >
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
              <line
                x1={padding}
                y1={yPos}
                x2={width - padding}
                y2={yPos}
                stroke="currentColor"
                strokeOpacity="0.1"
              />
              <text
                x={padding - 8}
                y={yPos + 4}
                textAnchor="end"
                fontSize="9"
                className="fill-slate-500 dark:fill-white font-semibold"
              >
                ₹{gridVal.toLocaleString("en-IN")}
              </text>
            </g>
          );
        })}

        {/* Shaded Area */}
        <path d={areaD} fill="url(#areaGrad)" />
        {/* Stroke Line */}
        <path
          d={pathD}
          fill="none"
          stroke="var(--chart-1)"
          strokeWidth="2.5"
          strokeLinecap="round"
        />

        {/* Data points */}
        {dataPoints.map((dp, idx) => {
          const cx = padding + idx * stepX;
          const cy = height - padding - (dp.value / maxVal) * chartH;

          // Only label occasional ticks on x axis if many data points
          const showLabel =
            dataPoints.length <= 15 ||
            idx % 4 === 0 ||
            idx === dataPoints.length - 1;

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
                  setHoveredData({
                    label: dp.label,
                    value: dp.value,
                    x: rect.left + window.scrollX,
                    y: rect.top + window.scrollY - 10,
                  });
                }}
                onMouseLeave={() => setHoveredData(null)}
              />
              {showLabel && (
                <text
                  x={cx}
                  y={height - padding + 15}
                  textAnchor="middle"
                  fontSize="8"
                  className="fill-slate-500 dark:fill-white font-semibold"
                >
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
  const filteredPatients = patients.filter(
    (pt) =>
      pt.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      pt.phone.includes(searchQuery),
  );

  const filteredMedicines = medicines
    .filter((med) =>
      med.name.toLowerCase().includes(medSearchQuery.toLowerCase()),
    )
    .sort((a, b) => {
      let cmp = 0;
      if (medSortBy === "name") cmp = a.name.localeCompare(b.name);
      else if (medSortBy === "stock") cmp = a.stock - b.stock;
      else if (medSortBy === "availability") {
        const avail = (s: number) => (s > 10 ? 2 : s > 0 ? 1 : 0);
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
          Loading Clinically Profile...
        </div>
      </div>
    );
  }

  const needsRoleSetup =
    doctorInfo &&
    doctorInfo.role === "DOCTOR" &&
    !doctorInfo.specialization &&
    !doctorInfo.location &&
    !doctorInfo.hospital_name;

  if (needsRoleSetup) {
    return (
      <RoleSelectionScreen user={doctorInfo} onCompleted={checkAuthSession} />
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
                  <label className="text-[8px] font-bold uppercase text-slate-400 block mb-0.5">
                    Clinic Name
                  </label>
                  <input
                    type="text"
                    placeholder="Clinic Name"
                    value={editClinicName}
                    onChange={(e) => setEditClinicName(e.target.value)}
                    className="px-2.5 py-1 border border-[var(--border)] rounded-xl bg-[var(--input-bg)] text-xs font-semibold focus:ring-1 focus:ring-indigo-500 outline-none h-8 w-40"
                  />
                </div>
                <div>
                  <label className="text-[8px] font-bold uppercase text-slate-400 block mb-0.5">
                    Doctor Name
                  </label>
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
              <div className="flex items-center space-x-2.5" ref={dropdownRef}>
                <div>
                  {doctorInfo?.facilities &&
                  doctorInfo.facilities.length > 0 ? (
                    <div className="relative">
                      <button
                        onClick={() =>
                          setIsFacilityDropdownOpen(!isFacilityDropdownOpen)
                        }
                        className="flex items-center space-x-1 cursor-pointer select-none text-left focus:outline-none"
                      >
                        <h1 className="text-lg font-black tracking-tight flex items-center hover:opacity-80 text-zinc-950 dark:text-zinc-50">
                          {doctorInfo?.clinic_name || "ClinicFlow"}
                          <ChevronDown
                            className={cn(
                              "w-4 h-4 ml-1 text-slate-400 transition-transform duration-200",
                              isFacilityDropdownOpen && "rotate-180",
                            )}
                          />
                        </h1>
                      </button>

                      {isFacilityDropdownOpen && (
                        <div className="absolute left-0 mt-1.5 w-64 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl z-50 py-1.5 animate-in fade-in slide-in-from-top-2 duration-150">
                          <div className="px-3 py-1.5 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider border-b border-slate-100 dark:border-slate-800/50 mb-1">
                            Switch Workspace
                          </div>
                          <div className="max-h-60 overflow-y-auto">
                            {doctorInfo.facilities.map((fac) => (
                              <button
                                key={fac.id}
                                onClick={async () => {
                                  setIsFacilityDropdownOpen(false);
                                  await handleSwitchFacility(fac.id);
                                }}
                                className={cn(
                                  "w-full text-left px-3.5 py-2 text-xs font-semibold flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/60 transition",
                                  fac.id === doctorInfo.active_facility_id
                                    ? "text-indigo-600 dark:text-indigo-400 bg-indigo-50/50 dark:bg-indigo-950/20"
                                    : "text-slate-700 dark:text-slate-300",
                                )}
                              >
                                <span className="truncate mr-2">
                                  {fac.name}
                                </span>
                                <span className="text-[9px] px-1.5 py-0.5 rounded-md font-bold uppercase tracking-wider bg-slate-100 dark:bg-slate-800 text-slate-500">
                                  {fac.type}
                                </span>
                              </button>
                            ))}
                          </div>
                          <div className="border-t border-slate-100 dark:border-slate-800/50 mt-1 pt-1">
                            <button
                              onClick={() => {
                                setIsFacilityDropdownOpen(false);
                                setIsCreateWorkspaceOpen(true);
                              }}
                              className="w-full text-left px-3.5 py-2 text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50/50 dark:hover:bg-emerald-950/10 flex items-center space-x-1.5 transition cursor-pointer"
                            >
                              <Plus className="w-3.5 h-3.5" />
                              <span>Create Workspace</span>
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <h1 className="text-lg font-black tracking-tight">
                      {doctorInfo?.clinic_name || "ClinicFlow"}
                    </h1>
                  )}
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

      {/* 2. Navigation Tabs (Desktop only) */}
      <nav className="hidden md:block border-b border-[var(--border)] bg-[var(--nav-bg)] py-1.5 transition-all">
        <div className="max-w-7xl mx-auto px-4 flex items-center space-x-1 overflow-x-auto">
          {(() => {
            const role = doctorInfo?.role || "DOCTOR";
            const allTabs: { id: string; label: string; icon: any }[] = [];
            if (role === "USER") {
              allTabs.push(
                {
                  id: "appointments",
                  label: "My Appointments",
                  icon: Calendar,
                },
                { id: "labs", label: "Lab Reports", icon: BriefcaseMedical },
                { id: "billing", label: "Billing & Invoices", icon: FileText },
                { id: "queue", label: "Queue Status", icon: Clock },
              );
            } else if (role === "PHARMACIST") {
              allTabs.push(
                { id: "billing", label: "Billing & Queue", icon: FileText },
                { id: "medicines", label: "Medicines Inventory", icon: Plus },
                { id: "whatsapp", label: "WhatsApp Gateway", icon: Smartphone },
              );
            } else if (role === "HOSPITAL_ADMIN") {
              allTabs.push(
                { id: "staff", label: "Staff Directory", icon: Users },
                { id: "patients", label: "Patient Directory", icon: Users },
                {
                  id: "appointments",
                  label: "Appointment Slots",
                  icon: Calendar,
                },
                {
                  id: "availability",
                  label: "Availability Settings",
                  icon: Settings,
                },
                { id: "queue", label: "Active Hospital Queue", icon: Clock },
                { id: "billing", label: "Billing & Ledger", icon: FileText },
                { id: "medicines", label: "Pharmacy Stock", icon: Plus },
                {
                  id: "analytics",
                  label: "Facility Analytics",
                  icon: Activity,
                },
                {
                  id: "doctor-analytics",
                  label: "Doctor Analytics",
                  icon: TrendingUp,
                },
                {
                  id: "reschedule-queue",
                  label: "Reschedule Queue",
                  icon: AlertTriangle,
                },
                { id: "whatsapp", label: "WhatsApp Gateway", icon: Smartphone },
              );
            } else {
              // Default to DOCTOR
              allTabs.push(
                {
                  id: "patients",
                  label: isClinicMode
                    ? "Patient Directory"
                    : "Treated Patients",
                  icon: Users,
                },
                { id: "prescriptions", label: "Prescriptions", icon: FileText },
                {
                  id: "appointments",
                  label: "Appointment Slots",
                  icon: Calendar,
                },
                { id: "queue", label: "Patient Queue", icon: Clock },
                { id: "availability", label: "Slot Settings", icon: Settings },
              );
              if (isClinicMode) {
                allTabs.push({
                  id: "whatsapp",
                  label: "WhatsApp Link",
                  icon: Smartphone,
                });
              }
            }
            return allTabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => {
                    const prevIndex = allTabs.findIndex(
                      (t) => t.id === activeTab,
                    );
                    const newIndex = allTabs.findIndex((t) => t.id === tab.id);
                    if (
                      prevIndex !== -1 &&
                      newIndex !== -1 &&
                      prevIndex !== newIndex
                    ) {
                      setDirection(newIndex > prevIndex ? 1 : -1);
                    }
                    setActiveTab(tab.id as any);
                    setViewState({ type: "list" });
                  }}
                  className={`relative flex items-center space-x-2 px-4 py-2.5 rounded-xl text-xs font-bold tracking-tight transition duration-200 cursor-pointer whitespace-nowrap select-none outline-none ${
                    isActive
                      ? "text-white shadow-md font-extrabold"
                      : "text-slate-600 dark:text-slate-400 hover:bg-slate-950/5 dark:hover:bg-white/10 hover:text-[var(--foreground)]"
                  }`}
                >
                  {isActive && <TabBubble />}
                  <Icon className="relative z-10 w-4 h-4" />
                  <span className="relative z-10">{tab.label}</span>
                </button>
              );
            });
          })()}
        </div>
      </nav>

      {/* 3. Main Dashboard Panels */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 pb-24 md:pb-6">
        {/* Workspace Creation Panel */}
        <FloatingPanelRoot
          isOpen={isCreateWorkspaceOpen}
          onOpenChange={setIsCreateWorkspaceOpen}
        >
          <FloatingPanelContent className="w-80 sm:w-96 text-left">
            <FloatingPanelBody>
              <form
                onSubmit={handleCreateWorkspace}
                className="space-y-4 text-xs text-[var(--foreground)]"
              >
                <div>
                  <label className="text-[10px] font-bold uppercase text-slate-400">
                    Workspace / Facility Name
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. City Hospital, Metro Clinic"
                    value={newWorkspaceName}
                    onChange={(e) => setNewWorkspaceName(e.target.value)}
                    className="w-full mt-1 px-4 py-2 border border-[var(--border)] rounded-2xl bg-[var(--input-bg)] text-xs focus:ring-2 focus:ring-indigo-500 outline-none text-black dark:text-white"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase text-slate-400">
                    Facility Type
                  </label>
                  <select
                    value={newWorkspaceType}
                    onChange={(e) =>
                      setNewWorkspaceType(
                        e.target.value as "CLINIC" | "HOSPITAL",
                      )
                    }
                    className="w-full mt-1 px-4 py-2 border border-[var(--border)] rounded-2xl bg-[var(--input-bg)] text-xs focus:ring-2 focus:ring-indigo-500 outline-none cursor-pointer text-black dark:text-white"
                  >
                    <option value="CLINIC">Private Clinic</option>
                    <option value="HOSPITAL">
                      Hospital / Diagnostic Center
                    </option>
                  </select>
                </div>
                <div className="flex justify-end space-x-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsCreateWorkspaceOpen(false)}
                    className="px-4 py-2 border border-[var(--border)] rounded-2xl text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800 font-bold transition cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="px-4 py-2 bg-indigo-600 text-white font-bold rounded-2xl hover:bg-indigo-700 transition disabled:opacity-50 cursor-pointer"
                  >
                    {isSubmitting ? "Creating..." : "Create Workspace"}
                  </button>
                </div>
              </form>
            </FloatingPanelBody>
          </FloatingPanelContent>
        </FloatingPanelRoot>

        {toast && (
          <div
            className={`fixed bottom-4 right-4 z-50 flex items-center space-x-2 px-4 py-3 rounded-2xl shadow-xl border ${
              toast.type === "success"
                ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-500"
                : "bg-red-500/10 border-red-500/20 text-red-500"
            }`}
          >
            {toast.type === "success" ? (
              <CheckCircle2 className="w-5 h-5" />
            ) : (
              <AlertCircle className="w-5 h-5" />
            )}
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
          <div
            className={`relative ${isTransitioning ? "overflow-hidden" : ""}`}
          >
            <TabTransition
              activeTab={activeTab}
              direction={direction}
              contentBoundsHeight={contentBounds.height || "auto"}
              contentRef={contentRef}
              onAnimationStart={() => setIsTransitioning(true)}
              onAnimationComplete={(definition) => {
                if (definition === "active") {
                  setIsTransitioning(false);
                }
              }}
            >
              {/* TABS INNER PAGES */}

              {activeTab === "staff" && (
                <div className="space-y-6">
                  <div className="flex justify-between items-center">
                    <h2 className="text-xl font-black">
                      Staff Onboarding & Directory
                    </h2>
                    <FloatingPanelRoot
                      isOpen={isInviteOpen}
                      onOpenChange={setIsInviteOpen}
                    >
                      <FloatingPanelTrigger
                        title="Invite Staff Member"
                        className="flex items-center justify-center space-x-1.5 px-4 py-2 bg-indigo-600 text-white hover:bg-indigo-700 font-bold rounded-2xl text-xs shadow-md transition cursor-pointer border-none"
                      >
                        <Plus className="w-4 h-4 mr-1.5" />
                        <span>Invite Staff</span>
                      </FloatingPanelTrigger>
                      <FloatingPanelContent className="w-80 sm:w-96 text-left">
                        <FloatingPanelBody>
                          <form
                            onSubmit={async (e) => {
                              e.preventDefault();
                              if (!inviteEmail) return;
                              const combinedPhone = invitePhone
                                ? getCombinedPhone(invitePhoneCode, invitePhone)
                                : "";
                              setIsSubmitting(true);
                              try {
                                const res = await fetchAPI(
                                  "/api/admin/invite",
                                  {
                                    method: "POST",
                                    body: JSON.stringify({
                                      email: inviteEmail,
                                      phone: combinedPhone,
                                      role: inviteRole,
                                      access_levels: [],
                                    }),
                                  },
                                );
                                setInviteLink(
                                  `${window.location.origin}/onboard?token=${res.token}`,
                                );
                                if (res.otp) {
                                  setInviteOTP(res.otp);
                                } else {
                                  setInviteOTP("");
                                }
                                setToast({
                                  message: "Staff invite code generated!",
                                  type: "success",
                                });
                                setInviteEmail("");
                                setInvitePhone("");
                                setInvitePhoneCode("+91");
                                setIsInviteOpen(false);
                              } catch (err: any) {
                                setToast({
                                  message:
                                    err.message || "Failed to invite staff",
                                  type: "error",
                                });
                              } finally {
                                setIsSubmitting(false);
                              }
                            }}
                            className="space-y-4 text-xs text-[var(--foreground)]"
                          >
                            <div>
                              <label className="text-[10px] font-bold uppercase text-slate-400">
                                Staff Email Address
                              </label>
                              <input
                                type="email"
                                required
                                placeholder="e.g. doctor@hospital.com"
                                value={inviteEmail}
                                onChange={(e) => setInviteEmail(e.target.value)}
                                className="w-full mt-1 px-4 py-2 border border-[var(--border)] rounded-2xl bg-[var(--input-bg)] text-xs focus:ring-2 focus:ring-indigo-500 outline-none"
                              />
                            </div>

                            <div>
                              <label className="text-[10px] font-bold uppercase text-slate-400">
                                Staff WhatsApp / Phone (Optional)
                              </label>
                              <div className="flex gap-2 mt-1">
                                <div className="w-24 flex-shrink-0">
                                  <select
                                    value={invitePhoneCode}
                                    onChange={(e) =>
                                      setInvitePhoneCode(e.target.value)
                                    }
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
                                  type="tel"
                                  placeholder="e.g. 9876543210"
                                  value={invitePhone}
                                  onChange={(e) =>
                                    setInvitePhone(e.target.value)
                                  }
                                  className="flex-grow px-4 py-2 border border-[var(--border)] rounded-2xl bg-[var(--input-bg)] text-xs focus:ring-2 focus:ring-indigo-500 outline-none h-[34px]"
                                />
                              </div>
                            </div>

                            <div>
                              <label className="text-[10px] font-bold uppercase text-slate-400">
                                Select Role
                              </label>
                              <select
                                value={inviteRole}
                                onChange={(e) =>
                                  setInviteRole(e.target.value as any)
                                }
                                className="w-full mt-1 px-4 py-2 border border-[var(--border)] rounded-2xl bg-[var(--input-bg)] text-xs focus:ring-2 focus:ring-indigo-500 outline-none"
                              >
                                <option value="DOCTOR">DOCTOR</option>
                                <option value="PHARMACIST">PHARMACIST</option>
                              </select>
                            </div>

                            <div className="flex space-x-2 pt-2 text-xs">
                              <FloatingPanelCloseButton className="w-1/2 py-2.5 rounded-2xl border border-[var(--border)] font-bold text-slate-500 hover:bg-[var(--card-hover)] transition cursor-pointer justify-center" />
                              <FloatingPanelSubmitButton
                                label="Generate Invite Link"
                                className="w-1/2 py-2.5 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold shadow-md transition cursor-pointer ml-0 h-auto justify-center"
                              />
                            </div>
                          </form>
                        </FloatingPanelBody>
                      </FloatingPanelContent>
                    </FloatingPanelRoot>
                  </div>

                  {inviteLink && (
                    <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-3xl p-6 space-y-3">
                      <h3 className="text-xs font-bold text-indigo-400 uppercase tracking-wider">
                        Generated Invitation Link
                      </h3>
                      <p className="text-[10px] text-slate-400">
                        Copy and share this onboarding link with the staff
                        member. They will need to verify with the OTP sent to
                        their email.
                      </p>
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          readOnly
                          value={inviteLink}
                          className="flex-grow px-3 py-2 border border-[var(--border)] rounded-xl bg-[var(--input-bg)] text-xs font-mono text-slate-400 outline-none"
                        />
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(inviteLink);
                            setToast({
                              message: "Invite link copied to clipboard!",
                              type: "success",
                            });
                          }}
                          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-md transition cursor-pointer"
                        >
                          Copy
                        </button>
                      </div>
                      {inviteOTP && (
                        <div className="mt-2 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-2xl space-y-1">
                          <span className="text-[10px] font-bold text-yellow-500 uppercase tracking-wider block">
                            Local Development OTP
                          </span>
                          <p className="text-[10px] text-slate-400">
                            Use this temporary OTP to verify the invitation
                            during testing:{" "}
                            <strong className="text-yellow-400 font-mono text-xs select-all">
                              {inviteOTP}
                            </strong>
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="bg-[var(--card)] border border-[var(--border)] rounded-3xl p-6 shadow-sm space-y-4">
                    <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest">
                      Active Staff Members
                    </h3>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="border-b border-[var(--border)] bg-[var(--nav-bg)] text-slate-500 dark:text-slate-400 font-bold uppercase">
                            <th className="px-6 py-4">Name</th>
                            <th className="px-6 py-4">Email</th>
                            <th className="px-6 py-4">Contact</th>
                            <th className="px-6 py-4">Specialization</th>
                            <th className="px-6 py-4">Location</th>
                            <th className="px-6 py-4 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {staffList.length > 0 ? (
                            staffList.map((member) => (
                              <tr
                                key={member.id}
                                className="border-b border-[var(--border)] hover:bg-table-row-hover transition"
                              >
                                <td className="px-6 py-4 font-semibold">
                                  {member.name}
                                </td>
                                <td className="px-6 py-4 text-slate-500">
                                  {member.email}
                                </td>
                                <td className="px-6 py-4 text-slate-500">
                                  {member.phone || "-"}
                                </td>
                                <td className="px-6 py-4 text-indigo-500 font-bold uppercase">
                                  {member.role === "HOSPITAL_ADMIN"
                                    ? "Hospital Admin"
                                    : member.role}
                                  {member.specialization
                                    ? ` (${member.specialization})`
                                    : ""}
                                </td>
                                <td className="px-6 py-4 text-slate-400">
                                  {member.location || "-"}
                                </td>
                                <td className="px-6 py-4 text-right">
                                  {doctorInfo?.role === "HOSPITAL_ADMIN" &&
                                    member.id !== doctorInfo.id && (
                                      <button
                                        onClick={() =>
                                          handleRemoveStaff(member.id)
                                        }
                                        className="p-1 hover:text-red-500 text-slate-400 bg-transparent border-none outline-none cursor-pointer"
                                        title="Remove Staff Member"
                                      >
                                        <Trash2 className="w-4 h-4" />
                                      </button>
                                    )}
                                </td>
                              </tr>
                            ))
                          ) : (
                            <tr className="border-b border-[var(--border)] hover:bg-table-row-hover transition">
                              <td className="px-6 py-4 font-semibold">
                                {doctorInfo?.name}
                              </td>
                              <td className="px-6 py-4 text-slate-500">
                                {doctorInfo?.email}
                              </td>
                              <td className="px-6 py-4 text-slate-500">
                                {doctorInfo?.phone || "-"}
                              </td>
                              <td className="px-6 py-4 text-indigo-500 font-bold uppercase">
                                {doctorInfo?.role}
                              </td>
                              <td className="px-6 py-4 text-slate-400">
                                {doctorInfo?.location || "-"}
                              </td>
                              <td className="px-6 py-4"></td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === "queue" && (
                <QueuePanel
                  doctorInfo={doctorInfo}
                  patients={patients}
                  facilityDoctors={facilityDoctors}
                  setToast={setToast}
                  isAuthenticated={isAuthenticated}
                  ownPatientProfile={ownPatientProfile}
                  loadOwnPatientProfile={loadOwnPatientProfile}
                />
              )}

              {activeTab === "vitals" && (
                <div className="space-y-6">
                  <div className="flex justify-between items-center">
                    <div>
                      <h2 className="text-xl font-black">
                        Health Vitals & Trends
                      </h2>
                      <p className="text-xs text-slate-400">
                        Track metrics including heart rate, BP, and weight over
                        time.
                      </p>
                    </div>
                    <FloatingPanelRoot
                      isOpen={isLogVitalsOpen}
                      onOpenChange={setIsLogVitalsOpen}
                    >
                      <FloatingPanelTrigger
                        title="Log New Vitals"
                        className="flex items-center justify-center space-x-1.5 px-4 py-2 bg-indigo-600 text-white hover:bg-indigo-700 font-bold rounded-2xl text-xs shadow-md transition cursor-pointer border-none"
                      >
                        <Plus className="w-4 h-4 mr-1.5" />
                        <span>Log Vitals</span>
                      </FloatingPanelTrigger>
                      <FloatingPanelContent className="w-80 sm:w-96 text-left max-h-[85vh] overflow-y-auto">
                        <FloatingPanelBody>
                          <form
                            onSubmit={async (e) => {
                              e.preventDefault();
                              const ptId =
                                doctorInfo?.role === "USER"
                                  ? ownPatientProfile?.patient?.id
                                  : parseInt(vitalsPatientId);
                              if (!ptId) {
                                setToast({
                                  message: "Patient selection required",
                                  type: "error",
                                });
                                return;
                              }
                              setIsSubmitting(true);

                              const customMetricsObj: Record<string, string> =
                                {};
                              logCustomMetrics.forEach((item) => {
                                if (item.key.trim() && item.value.trim()) {
                                  customMetricsObj[item.key.trim()] =
                                    item.value.trim();
                                }
                              });

                              try {
                                const res = await fetchAPI("/api/vitals", {
                                  method: "POST",
                                  body: JSON.stringify({
                                    patient_id: ptId,
                                    weight_kg: logWeight
                                      ? parseFloat(logWeight)
                                      : null,
                                    blood_pressure: logBP || null,
                                    heart_rate: logHR
                                      ? parseInt(logHR)
                                      : logPulse
                                        ? parseInt(logPulse)
                                        : 0,
                                    pulse: logPulse ? parseInt(logPulse) : null,
                                    spo2: logSpO2 ? parseInt(logSpO2) : null,
                                    temperature: logTemp
                                      ? parseFloat(logTemp)
                                      : null,
                                    encounter_id: logEncounterId
                                      ? parseInt(logEncounterId)
                                      : null,
                                    custom_metrics:
                                      Object.keys(customMetricsObj).length > 0
                                        ? customMetricsObj
                                        : null,
                                  }),
                                });
                                setToast({
                                  message: res.alert_triggered
                                    ? "Vitals logged! ⚠️ ALERT: Out of range metrics detected."
                                    : "Vitals logged successfully!",
                                  type: res.alert_triggered
                                    ? "error"
                                    : "success",
                                });
                                setLogWeight("");
                                setLogBP("");
                                setLogHR("");
                                setLogPulse("");
                                setLogSpO2("");
                                setLogTemp("");
                                setLogEncounterId("");
                                setLogCustomMetrics([]);
                                setIsLogVitalsOpen(false);
                                if (doctorInfo?.role === "USER") {
                                  loadOwnPatientProfile();
                                } else {
                                  loadVitals(ptId);
                                }
                              } catch (err: any) {
                                setToast({
                                  message:
                                    err.message || "Failed to log vitals",
                                  type: "error",
                                });
                              } finally {
                                setIsSubmitting(false);
                              }
                            }}
                            className="space-y-4 text-xs text-[var(--foreground)]"
                          >
                            {doctorInfo?.role !== "USER" && (
                              <div>
                                <label className="text-[10px] font-bold uppercase text-slate-400">
                                  Select Patient
                                </label>
                                <select
                                  required
                                  value={vitalsPatientId}
                                  onChange={(e) => {
                                    setVitalsPatientId(e.target.value);
                                    if (e.target.value) {
                                      const ptId = parseInt(e.target.value);
                                      loadVitals(ptId);
                                      loadVitalsPatientAppointments(ptId);
                                    } else {
                                      setVitalsAppointments([]);
                                    }
                                  }}
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

                            <div className="grid grid-cols-3 gap-3">
                              <div>
                                <label className="text-[10px] font-bold uppercase text-slate-400">
                                  Weight (kg)
                                </label>
                                <input
                                  type="number"
                                  step="0.1"
                                  placeholder="72.5"
                                  value={logWeight}
                                  onChange={(e) => setLogWeight(e.target.value)}
                                  className="w-full mt-1 px-3 py-2 border border-[var(--border)] rounded-2xl bg-[var(--input-bg)] text-xs focus:ring-2 focus:ring-indigo-500 outline-none"
                                />
                              </div>
                              <div>
                                <label className="text-[10px] font-bold uppercase text-slate-400">
                                  Blood Pressure
                                </label>
                                <input
                                  type="text"
                                  placeholder="120/80"
                                  value={logBP}
                                  onChange={(e) => setLogBP(e.target.value)}
                                  className="w-full mt-1 px-3 py-2 border border-[var(--border)] rounded-2xl bg-[var(--input-bg)] text-xs focus:ring-2 focus:ring-indigo-500 outline-none"
                                />
                              </div>
                              <div>
                                <label className="text-[10px] font-bold uppercase text-slate-400">
                                  Heart Rate / Pulse (bpm)
                                </label>
                                <input
                                  type="number"
                                  placeholder="72"
                                  value={logHR}
                                  onChange={(e) => {
                                    setLogHR(e.target.value);
                                    setLogPulse(e.target.value);
                                  }}
                                  className="w-full mt-1 px-3 py-2 border border-[var(--border)] rounded-2xl bg-[var(--input-bg)] text-xs focus:ring-2 focus:ring-indigo-500 outline-none"
                                />
                              </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3 mt-3">
                              <div>
                                <label className="text-[10px] font-bold uppercase text-slate-400">
                                  SpO2 (%)
                                </label>
                                <input
                                  type="number"
                                  placeholder="98"
                                  value={logSpO2}
                                  onChange={(e) => setLogSpO2(e.target.value)}
                                  className="w-full mt-1 px-3 py-2 border border-[var(--border)] rounded-2xl bg-[var(--input-bg)] text-xs focus:ring-2 focus:ring-indigo-500 outline-none"
                                />
                              </div>
                              <div>
                                <label className="text-[10px] font-bold uppercase text-slate-400">
                                  Temp (°C)
                                </label>
                                <input
                                  type="number"
                                  step="0.1"
                                  placeholder="36.8"
                                  value={logTemp}
                                  onChange={(e) => setLogTemp(e.target.value)}
                                  className="w-full mt-1 px-3 py-2 border border-[var(--border)] rounded-2xl bg-[var(--input-bg)] text-xs focus:ring-2 focus:ring-indigo-500 outline-none"
                                />
                              </div>
                            </div>

                            {vitalsAppointments.length > 0 && (
                              <div>
                                <label className="text-[10px] font-bold uppercase text-slate-400">
                                  Link to Appointment / Visit
                                </label>
                                <select
                                  value={logEncounterId}
                                  onChange={(e) =>
                                    setLogEncounterId(e.target.value)
                                  }
                                  className="w-full mt-1 px-4 py-2 border border-[var(--border)] rounded-2xl bg-[var(--input-bg)] text-xs focus:ring-2 focus:ring-indigo-500 outline-none"
                                >
                                  <option value="">
                                    -- Do Not Link / Standalone --
                                  </option>
                                  {vitalsAppointments.map((appt) => (
                                    <option key={appt.id} value={appt.id}>
                                      Visit on{" "}
                                      {new Date(
                                        appt.appointment_date,
                                      ).toLocaleDateString()}{" "}
                                      - {appt.reason || "General Checkup"}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            )}

                            {/* Custom Metrics Key-Value Builder */}
                            <div className="border-t border-[var(--border)] pt-3 mt-2">
                              <div className="flex justify-between items-center mb-1.5">
                                <label className="text-[10px] font-bold uppercase text-slate-400">
                                  Custom Clinical Metrics
                                </label>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setLogCustomMetrics([
                                      ...logCustomMetrics,
                                      { key: "", value: "" },
                                    ])
                                  }
                                  className="text-xs text-indigo-500 font-bold hover:underline"
                                >
                                  + Add Metric
                                </button>
                              </div>
                              {logCustomMetrics.map((item, idx) => (
                                <div
                                  key={idx}
                                  className="flex items-center space-x-2 mt-1"
                                >
                                  <input
                                    type="text"
                                    placeholder="Metric Name (e.g. Sugar)"
                                    value={item.key}
                                    onChange={(e) => {
                                      const updated = [...logCustomMetrics];
                                      updated[idx].key = e.target.value;
                                      setLogCustomMetrics(updated);
                                    }}
                                    className="w-1/2 px-2 py-1.5 border border-[var(--border)] rounded-xl bg-[var(--input-bg)] text-xs focus:ring-1 focus:ring-indigo-500 outline-none"
                                  />
                                  <input
                                    type="text"
                                    placeholder="Value (e.g. 110mg/dL)"
                                    value={item.value}
                                    onChange={(e) => {
                                      const updated = [...logCustomMetrics];
                                      updated[idx].value = e.target.value;
                                      setLogCustomMetrics(updated);
                                    }}
                                    className="w-1/2 px-2 py-1.5 border border-[var(--border)] rounded-xl bg-[var(--input-bg)] text-xs focus:ring-1 focus:ring-indigo-500 outline-none"
                                  />
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setLogCustomMetrics(
                                        logCustomMetrics.filter(
                                          (_, i) => i !== idx,
                                        ),
                                      )
                                    }
                                    className="text-red-500 hover:text-red-700 font-bold text-xs"
                                  >
                                    Remove
                                  </button>
                                </div>
                              ))}
                            </div>

                            <div className="flex space-x-2 pt-2 text-xs">
                              <FloatingPanelCloseButton className="w-1/2 py-2.5 rounded-2xl border border-[var(--border)] font-bold text-slate-500 hover:bg-[var(--card-hover)] transition cursor-pointer justify-center" />
                              <FloatingPanelSubmitButton
                                label="Record Metrics"
                                className="w-1/2 py-2.5 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold shadow-md transition cursor-pointer ml-0 h-auto justify-center"
                              />
                            </div>
                          </form>
                        </FloatingPanelBody>
                      </FloatingPanelContent>
                    </FloatingPanelRoot>
                  </div>

                  {vitalsHistory.length > 0 ? (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      {/* SVG Trend Chart for Heart Rate */}
                      <div className="bg-[var(--card)] border border-[var(--border)] rounded-3xl p-6 shadow-sm space-y-4">
                        <h3 className="text-sm font-black text-slate-200">
                          Heart Rate (bpm) Trend
                        </h3>
                        <div className="h-64 flex items-center justify-center">
                          {renderLineChart(
                            vitalsHistory.map((v) => ({
                              label: new Date(
                                v.recorded_at,
                              ).toLocaleDateString(),
                              value: v.pulse || v.heart_rate || 70,
                            })),
                          )}
                        </div>
                      </div>

                      {/* SVG Trend Chart for Weight */}
                      <div className="bg-[var(--card)] border border-[var(--border)] rounded-3xl p-6 shadow-sm space-y-4">
                        <h3 className="text-sm font-black text-slate-200">
                          Weight History (kg)
                        </h3>
                        <div className="h-64 flex items-center justify-center">
                          {renderHistogram(
                            vitalsHistory.map((v) => ({
                              label: new Date(
                                v.recorded_at,
                              ).toLocaleDateString(),
                              value: parseFloat(v.weight_kg) || 0.0,
                            })),
                          )}
                        </div>
                      </div>

                      {/* Vitals Log Table */}
                      <div className="lg:col-span-2 bg-[var(--card)] border border-[var(--border)] rounded-3xl p-6 shadow-sm space-y-4">
                        <h3 className="text-sm font-black text-slate-200 uppercase tracking-widest">
                          Logs History
                        </h3>
                        <div className="overflow-x-auto">
                          <table className="w-full text-left text-xs border-collapse">
                            <thead>
                              <tr className="border-b border-[var(--border)] bg-[var(--nav-bg)] text-slate-500 dark:text-slate-400 font-bold uppercase">
                                <th className="px-4 py-3">Recorded At</th>
                                <th className="px-4 py-3">Weight</th>
                                <th className="px-4 py-3">Blood Pressure</th>
                                <th className="px-4 py-3">Pulse / HR</th>
                                <th className="px-4 py-3">SpO2</th>
                                <th className="px-4 py-3">Temp</th>
                                <th className="px-4 py-3">Custom Metrics</th>
                                <th className="px-4 py-3 text-right">Status</th>
                              </tr>
                            </thead>
                            <tbody>
                              {vitalsHistory.map((v) => {
                                const bpAlert = v.blood_pressure
                                  ? checkBPRange(v.blood_pressure)[0]
                                  : false;
                                const hrAlert = v.heart_rate
                                  ? checkHRRange(v.heart_rate)[0]
                                  : false;
                                const pulseAlert = v.pulse
                                  ? checkHRRange(v.pulse)[0]
                                  : false;
                                const spo2Alert = v.spo2 ? v.spo2 < 95 : false;
                                const tempAlert = v.temperature
                                  ? v.temperature > 37.8 || v.temperature < 35.5
                                  : false;

                                const hasAlert =
                                  bpAlert ||
                                  hrAlert ||
                                  pulseAlert ||
                                  spo2Alert ||
                                  tempAlert;
                                return (
                                  <tr
                                    key={v.id}
                                    className="border-b border-[var(--border)] hover:bg-[var(--card-hover)] transition"
                                  >
                                    <td className="px-4 py-3 text-slate-400 font-medium">
                                      {new Date(v.recorded_at).toLocaleString()}
                                    </td>
                                    <td className="px-4 py-3 font-semibold">
                                      {v.weight_kg ? `${v.weight_kg} kg` : "-"}
                                    </td>
                                    <td className="px-4 py-3">
                                      <span
                                        className={cn(
                                          bpAlert && "text-red-500 font-bold",
                                        )}
                                      >
                                        {v.blood_pressure || "-"}
                                      </span>
                                    </td>
                                    <td className="px-4 py-3">
                                      <span
                                        className={cn(
                                          (hrAlert || pulseAlert) &&
                                            "text-red-500 font-bold",
                                        )}
                                      >
                                        {v.pulse
                                          ? `${v.pulse} bpm`
                                          : v.heart_rate
                                            ? `${v.heart_rate} bpm`
                                            : "-"}
                                      </span>
                                    </td>
                                    <td className="px-4 py-3">
                                      <span
                                        className={cn(
                                          spo2Alert && "text-red-500 font-bold",
                                        )}
                                      >
                                        {v.spo2 ? `${v.spo2}%` : "-"}
                                      </span>
                                    </td>
                                    <td className="px-4 py-3">
                                      <span
                                        className={cn(
                                          tempAlert && "text-red-500 font-bold",
                                        )}
                                      >
                                        {v.temperature
                                          ? `${v.temperature}°C`
                                          : "-"}
                                      </span>
                                    </td>
                                    <td className="px-4 py-3">
                                      {v.custom_metrics &&
                                      Object.keys(v.custom_metrics).length >
                                        0 ? (
                                        <div className="flex flex-wrap gap-1">
                                          {Object.entries(v.custom_metrics).map(
                                            ([key, val]: any) => (
                                              <span
                                                key={key}
                                                className="inline-block px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[10px] text-slate-600 dark:text-slate-300 font-medium"
                                              >
                                                {key}: {val}
                                              </span>
                                            ),
                                          )}
                                        </div>
                                      ) : (
                                        "-"
                                      )}
                                    </td>
                                    <td className="px-4 py-3 text-right">
                                      <span
                                        className={cn(
                                          "inline-flex px-2 py-0.5 rounded-full text-[9px] font-bold",
                                          hasAlert
                                            ? "bg-red-500/10 text-red-500"
                                            : "bg-emerald-500/10 text-emerald-500",
                                        )}
                                      >
                                        {hasAlert
                                          ? "⚠️ Out of Range"
                                          : "✓ Safe Range"}
                                      </span>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-12 text-slate-400 font-semibold bg-[var(--card)] border border-[var(--border)] rounded-3xl">
                      No vitals logged yet. Click 'Log Vitals' to add record.
                    </div>
                  )}
                </div>
              )}

              {activeTab === "labs" && (
                <div className="space-y-6">
                  <div className="flex justify-between items-center">
                    <div>
                      <h2 className="text-xl font-black">
                        Laboratory Services
                      </h2>
                      <p className="text-xs text-slate-400">
                        Order diagnostics tests and retrieve uploaded clinical
                        lab reports.
                      </p>
                    </div>
                    {doctorInfo?.role !== "USER" && (
                      <FloatingPanelRoot
                        isOpen={isRequestLabOpen}
                        onOpenChange={setIsRequestLabOpen}
                      >
                        <FloatingPanelTrigger
                          title="Order Diagnostics Lab Test"
                          className="flex items-center justify-center space-x-1.5 px-4 py-2 bg-indigo-600 text-white hover:bg-indigo-700 font-bold rounded-2xl text-xs shadow-md transition cursor-pointer border-none"
                        >
                          <Plus className="w-4 h-4 mr-1.5" />
                          <span>Order Lab Test</span>
                        </FloatingPanelTrigger>
                        <FloatingPanelContent className="w-80 sm:w-96 text-left">
                          <FloatingPanelBody>
                            <form
                              onSubmit={async (e) => {
                                e.preventDefault();
                                if (!newLabPatientId || !newLabTestName) return;
                                setIsSubmitting(true);
                                try {
                                  await fetchAPI("/api/labs/request", {
                                    method: "POST",
                                    body: JSON.stringify({
                                      patient_id: parseInt(newLabPatientId),
                                      test_name: newLabTestName,
                                    }),
                                  });
                                  setToast({
                                    message: "Lab test ordered successfully!",
                                    type: "success",
                                  });
                                  setNewLabPatientId("");
                                  setNewLabTestName("");
                                  setIsRequestLabOpen(false);
                                  loadLabRequests(parseInt(newLabPatientId));
                                } catch (err: any) {
                                  setToast({
                                    message:
                                      err.message || "Failed to order lab test",
                                    type: "error",
                                  });
                                } finally {
                                  setIsSubmitting(false);
                                }
                              }}
                              className="space-y-4 text-xs text-[var(--foreground)]"
                            >
                              <div>
                                <label className="text-[10px] font-bold uppercase text-slate-400">
                                  Select Patient
                                </label>
                                <select
                                  required
                                  value={newLabPatientId}
                                  onChange={(e) => {
                                    setNewLabPatientId(e.target.value);
                                    if (e.target.value)
                                      loadLabRequests(parseInt(e.target.value));
                                  }}
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
                                <label className="text-[10px] font-bold uppercase text-slate-400">
                                  Diagnostics Test Name
                                </label>
                                <input
                                  type="text"
                                  required
                                  placeholder="e.g. Complete Blood Count (CBC)"
                                  value={newLabTestName}
                                  onChange={(e) =>
                                    setNewLabTestName(e.target.value)
                                  }
                                  className="w-full mt-1 px-4 py-2 border border-[var(--border)] rounded-2xl bg-[var(--input-bg)] text-xs focus:ring-2 focus:ring-indigo-500 outline-none"
                                />
                              </div>

                              <div className="flex space-x-2 pt-2 text-xs">
                                <FloatingPanelCloseButton className="w-1/2 py-2.5 rounded-2xl border border-[var(--border)] font-bold text-slate-500 hover:bg-[var(--card-hover)] transition cursor-pointer justify-center" />
                                <FloatingPanelSubmitButton
                                  label="Order Test"
                                  className="w-1/2 py-2.5 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold shadow-md transition cursor-pointer ml-0 h-auto justify-center"
                                />
                              </div>
                            </form>
                          </FloatingPanelBody>
                        </FloatingPanelContent>
                      </FloatingPanelRoot>
                    )}
                  </div>

                  {/* Lab Upload Dialog Box */}
                  {isUploadLabOpen && (
                    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
                      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-md w-full text-left space-y-4">
                        <div className="flex justify-between items-center border-b border-slate-800 pb-3">
                          <h3 className="text-sm font-bold text-slate-200">
                            Upload Diagnostics Report
                          </h3>
                          <button
                            onClick={() => setIsUploadLabOpen(false)}
                            className="text-slate-400 hover:text-white"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                        <form
                          onSubmit={async (e) => {
                            e.preventDefault();
                            if (!uploadLabRequestId || !uploadReportUrl) return;
                            setIsSubmitting(true);
                            try {
                              await fetchAPI("/api/labs/upload", {
                                method: "POST",
                                body: JSON.stringify({
                                  lab_request_id: uploadLabRequestId,
                                  report_url: uploadReportUrl,
                                  result_summary: uploadResultSummary,
                                }),
                              });
                              setToast({
                                message: "Lab report uploaded successfully!",
                                type: "success",
                              });
                              setUploadReportUrl("");
                              setUploadResultSummary("");
                              setUploadLabRequestId(null);
                              setIsUploadLabOpen(false);
                               const ptId =
                                doctorInfo?.role === "USER"
                                  ? ownPatientProfile?.patient?.id
                                  : currentPatientData?.patient?.id || parseInt(newLabPatientId);
                               if (ptId) loadLabRequests(ptId);
                            } catch (err: any) {
                              setToast({
                                message:
                                  err.message || "Failed to upload report",
                                type: "error",
                              });
                            } finally {
                              setIsSubmitting(false);
                            }
                          }}
                          className="space-y-4 text-xs text-[var(--foreground)]"
                        >
                          <div>
                            <label className="text-[10px] font-bold uppercase text-slate-400">
                              Report Document URL
                            </label>
                            <input
                              type="url"
                              required
                              placeholder="https://..."
                              value={uploadReportUrl}
                              onChange={(e) =>
                                setUploadReportUrl(e.target.value)
                              }
                              className="w-full mt-1 px-4 py-2.5 border border-slate-800 rounded-2xl bg-slate-950 text-xs focus:ring-2 focus:ring-indigo-500 outline-none text-white"
                            />
                          </div>

                          <div>
                            <label className="text-[10px] font-bold uppercase text-slate-400">
                              Result Summary Remarks
                            </label>
                            <textarea
                              placeholder="Enter test findings and parameters summary..."
                              value={uploadResultSummary}
                              onChange={(e) =>
                                setUploadResultSummary(e.target.value)
                              }
                              rows={3}
                              className="w-full mt-1 px-4 py-2.5 border border-slate-800 rounded-2xl bg-slate-950 text-xs focus:ring-2 focus:ring-indigo-500 outline-none text-white resize-none"
                            />
                          </div>

                          <button
                            type="submit"
                            className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-2xl text-xs transition cursor-pointer"
                          >
                            Complete and Close Request
                          </button>
                        </form>
                      </div>
                    </div>
                  )}

                  {doctorInfo?.role !== "USER" && !newLabPatientId && (
                    <div className="p-4 bg-indigo-500/10 border border-indigo-500/20 text-indigo-500 text-xs rounded-2xl">
                      Please select a patient under <b>Health Vitals</b> or
                      select patient search to fetch lab request history.
                    </div>
                  )}

                  {(labRequests.length > 0 ||
                    (doctorInfo?.role !== "USER" && newLabPatientId)) && (
                    <div className="bg-[var(--card)] border border-[var(--border)] rounded-3xl overflow-hidden transition-all shadow-sm">
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs border-collapse">
                          <thead>
                            <tr className="border-b border-[var(--border)] bg-[var(--nav-bg)] text-slate-500 dark:text-slate-400 font-bold uppercase">
                              <th className="px-6 py-4">Ordered Date</th>
                              <th className="px-6 py-4">Doctor</th>
                              <th className="px-6 py-4">Test Name</th>
                              <th className="px-6 py-4">Status</th>
                              <th className="px-6 py-4">Findings / Summary</th>
                              <th className="px-6 py-4 text-right">Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {labRequests.length > 0 ? (
                              labRequests.map((lr) => (
                                <tr
                                  key={lr.id}
                                  className="border-b border-[var(--border)] hover:bg-table-row-hover transition"
                                >
                                  <td className="px-6 py-4 font-semibold text-slate-500">
                                    {new Date(
                                      lr.requested_date,
                                    ).toLocaleDateString()}
                                  </td>
                                  <td className="px-6 py-4 text-slate-400">
                                    Dr. {lr.doctor_name}
                                  </td>
                                  <td className="px-6 py-4 font-bold text-slate-600 dark:text-slate-200">
                                    {lr.test_name}
                                  </td>
                                  <td className="px-6 py-4">
                                    <span
                                      className={cn(
                                        "inline-flex px-2 py-0.5 rounded-full text-[9px] font-bold",
                                        lr.status === "COMPLETED"
                                          ? "bg-emerald-500/10 text-emerald-500"
                                          : "bg-indigo-500/10 text-indigo-500",
                                      )}
                                    >
                                      {lr.status}
                                    </span>
                                  </td>
                                  <td className="px-6 py-4 text-slate-400 max-w-xs truncate">
                                    {lr.result_summary || "-"}
                                  </td>
                                  <td className="px-6 py-4 text-right">
                                    {lr.status === "REQUESTED" &&
                                      doctorInfo?.role !== "USER" && (
                                        <button
                                          onClick={() => {
                                            setUploadLabRequestId(lr.id);
                                            setIsUploadLabOpen(true);
                                          }}
                                          className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-bold rounded-xl shadow-md transition cursor-pointer"
                                        >
                                          Upload Report
                                        </button>
                                      )}
                                    {lr.status === "COMPLETED" &&
                                      lr.report_url && (
                                        <a
                                          href={lr.report_url}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="inline-block px-3 py-1 bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 text-[10px] font-bold rounded-xl transition"
                                        >
                                          View Document
                                        </a>
                                      )}
                                  </td>
                                </tr>
                              ))
                            ) : (
                              <tr>
                                <td
                                  colSpan={6}
                                  className="px-6 py-12 text-center text-slate-400 font-semibold"
                                >
                                  No lab orders logged for this patient.
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}

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
                    {((doctorInfo?.role === "DOCTOR" && isClinicMode) ||
                      doctorInfo?.role === "HOSPITAL_ADMIN") && (
                      <FloatingPanelRoot
                        isOpen={isAddPatientOpen}
                        onOpenChange={setIsAddPatientOpen}
                      >
                        <FloatingPanelTrigger
                          title="Register New Patient"
                          className="flex items-center justify-center space-x-1.5 px-4 py-2 bg-zinc-950 text-white hover:bg-primary hover:text-black dark:bg-white dark:text-zinc-950 dark:hover:bg-primary dark:hover:text-black font-bold rounded-2xl text-xs shadow-md transition cursor-pointer border-none"
                        >
                          <Plus className="w-4 h-4 mr-1.5" />
                          <span>Register Patient</span>
                        </FloatingPanelTrigger>
                        <FloatingPanelContent className="w-80 sm:w-96 text-left">
                          <FloatingPanelBody>
                            <form
                              onSubmit={handleAddPatient}
                              className="space-y-3.5 text-xs text-[var(--foreground)]"
                            >
                              <div>
                                <label className="text-[10px] font-bold uppercase text-slate-400">
                                  Full Name
                                </label>
                                <input
                                  type="text"
                                  required
                                  value={newPtName}
                                  onChange={(e) => setNewPtName(e.target.value)}
                                  className="w-full mt-1 px-4 py-2 border border-[var(--border)] rounded-2xl bg-[var(--input-bg)] text-xs focus:ring-2 focus:ring-indigo-500 outline-none"
                                />
                              </div>

                              <div>
                                <label className="text-[10px] font-bold uppercase text-slate-400">
                                  Phone Number (with Country Code)
                                </label>
                                <div className="flex gap-2 mt-1">
                                  <div className="w-24 flex-shrink-0">
                                    <select
                                      value={newPtPhoneCode}
                                      onChange={(e) =>
                                        setNewPtPhoneCode(e.target.value)
                                      }
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
                                    required
                                    placeholder="e.g. 9999999999"
                                    value={newPtPhone}
                                    onChange={(e) =>
                                      setNewPtPhone(e.target.value)
                                    }
                                    className="flex-grow px-4 py-2 border border-[var(--border)] rounded-2xl bg-[var(--input-bg)] text-xs focus:ring-2 focus:ring-indigo-500 outline-none h-[34px]"
                                  />
                                </div>
                              </div>

                              <div className="grid grid-cols-2 gap-4">
                                <div>
                                  <label className="text-[10px] font-bold uppercase text-slate-400">
                                    Age
                                  </label>
                                  <input
                                    type="number"
                                    value={newPtAge}
                                    onChange={(e) =>
                                      setNewPtAge(e.target.value)
                                    }
                                    className="w-full mt-1 px-4 py-2 border border-[var(--border)] rounded-2xl bg-[var(--input-bg)] text-xs focus:ring-2 focus:ring-indigo-500 outline-none"
                                  />
                                </div>
                                <div>
                                  <label className="text-[10px] font-bold uppercase text-slate-400">
                                    Gender
                                  </label>
                                  <select
                                    value={newPtGender}
                                    onChange={(e) =>
                                      setNewPtGender(e.target.value)
                                    }
                                    className="w-full mt-1 px-4 py-2 border border-[var(--border)] rounded-2xl bg-[var(--input-bg)] text-xs focus:ring-2 focus:ring-indigo-500 outline-none"
                                  >
                                    <option>Male</option>
                                    <option>Female</option>
                                    <option>Other</option>
                                  </select>
                                </div>
                              </div>

                              <div>
                                <label className="text-[10px] font-bold uppercase text-slate-400">
                                  Medical History Summary
                                </label>
                                <textarea
                                  placeholder="Allergies, chronic illness, major surgeries..."
                                  value={newPtHistory}
                                  onChange={(e) =>
                                    setNewPtHistory(e.target.value)
                                  }
                                  rows={3}
                                  className="w-full mt-1 px-4 py-2 border border-[var(--border)] rounded-2xl bg-[var(--input-bg)] text-xs focus:ring-2 focus:ring-indigo-500 outline-none resize-none"
                                />
                              </div>

                              <div>
                                <label className="text-[10px] font-bold uppercase text-slate-400">
                                  Refer to Doctor
                                </label>
                                <select
                                  value={selectedDoctorIds[0] || ""}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    setSelectedDoctorIds(
                                      val ? [parseInt(val)] : [],
                                    );
                                  }}
                                  className="w-full mt-1 px-4 py-2 border border-[var(--border)] rounded-2xl bg-[var(--input-bg)] text-xs focus:ring-2 focus:ring-indigo-500 outline-none cursor-pointer h-[34px]"
                                  required={
                                    doctorInfo?.role === "HOSPITAL_ADMIN"
                                  }
                                >
                                  <option value="">Select Doctor</option>
                                  {facilityDoctors.map((doc) => (
                                    <option key={doc.id} value={doc.id}>
                                      Dr. {doc.name} (
                                      {doc.specialization || "General"})
                                    </option>
                                  ))}
                                </select>
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
                    )}
                  </div>

                  <div className="bg-[var(--card)] border border-[var(--border)] rounded-3xl overflow-hidden transition-all shadow-sm">
                    {/* Mobile Card List View */}
                    <div className="block md:hidden divide-y divide-[var(--border)] bg-[var(--card)]">
                      {filteredPatients.length > 0 ? (
                        filteredPatients.map((pt) => (
                          <div
                            key={pt.id}
                            onClick={() =>
                              setViewState({
                                type: "patient",
                                patientId: pt.id,
                              })
                            }
                            className="p-4 hover:bg-[var(--accent)] transition cursor-pointer space-y-2"
                          >
                            <div className="flex justify-between items-center">
                              <span className="font-bold text-sm text-zinc-950 dark:text-zinc-50">
                                {pt.name}
                              </span>
                              <div
                                className="flex items-center space-x-2"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <span
                                  className={cn(
                                    "font-black text-xs",
                                    pt.total_dues > 0
                                      ? "text-red-500"
                                      : "text-emerald-500",
                                  )}
                                >
                                  {pt.total_dues > 0
                                    ? `₹${pt.total_dues.toLocaleString("en-IN")}`
                                    : "Settled"}
                                </span>
                                {doctorInfo?.role === "HOSPITAL_ADMIN" && (
                                  <button
                                    onClick={() => handleDeletePatient(pt.id)}
                                    className="p-1 hover:text-red-500 text-slate-400 bg-transparent border-none outline-none cursor-pointer"
                                    title="Delete Patient"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            </div>
                            <div className="flex justify-between items-center text-xs text-slate-500 dark:text-slate-400">
                              <span>{pt.phone}</span>
                              <span>
                                {pt.age} yrs / {pt.gender}
                              </span>
                            </div>
                            {pt.medical_history && (
                              <p className="text-[11px] text-slate-400 truncate">
                                {pt.medical_history}
                              </p>
                            )}
                          </div>
                        ))
                      ) : (
                        <div className="p-8 text-center text-slate-400 font-semibold">
                          {isDoctorInHospital
                            ? "No treated patients found."
                            : "No patients found. Click 'Register Patient' to add one."}
                        </div>
                      )}
                    </div>

                    {/* Desktop Table View */}
                    <div className="hidden md:block overflow-x-auto">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="border-b border-[var(--border)] bg-[var(--nav-bg)] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider">
                            <th className="px-6 py-4">Patient Name</th>
                            <th className="px-6 py-4">Phone</th>
                            <th className="px-6 py-4">Age / Gender</th>
                            <th className="px-6 py-4">
                              Medical History Summary
                            </th>
                            <th className="px-6 py-4 text-right">
                              Outstanding Dues
                            </th>
                            <th className="px-6 py-4 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredPatients.length > 0 ? (
                            filteredPatients.map((pt) => (
                              <tr
                                key={pt.id}
                                onClick={() =>
                                  setViewState({
                                    type: "patient",
                                    patientId: pt.id,
                                  })
                                }
                                className="border-b border-[var(--border)] hover:bg-table-row-hover transition cursor-pointer"
                              >
                                <td className="px-6 py-4 font-normal text-sm">
                                  {pt.name}
                                </td>
                                <td className="px-6 py-4 text-slate-500 dark:text-slate-400 font-medium">
                                  {pt.phone}
                                </td>
                                <td className="px-6 py-4 text-slate-500 dark:text-slate-400 font-medium">
                                  {pt.age} yrs / {pt.gender}
                                </td>
                                <td className="px-6 py-4 text-slate-400 truncate max-w-xs">
                                  {pt.medical_history || "No logs"}
                                </td>
                                <td className="px-6 py-4 text-right font-black text-red-500">
                                  {pt.total_dues > 0
                                    ? `₹${pt.total_dues.toLocaleString("en-IN")}`
                                    : "Settled"}
                                </td>
                                <td
                                  className="px-6 py-4 text-right"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  {doctorInfo?.role === "HOSPITAL_ADMIN" && (
                                    <button
                                      onClick={() => handleDeletePatient(pt.id)}
                                      className="p-1 hover:text-red-500 text-slate-400 bg-transparent border-none outline-none cursor-pointer"
                                      title="Delete Patient"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  )}
                                </td>
                              </tr>
                            ))
                          ) : (
                            <tr>
                              <td
                                colSpan={6}
                                className="px-6 py-12 text-center text-slate-400 font-semibold"
                              >
                                {isDoctorInHospital
                                  ? "No treated patients found."
                                  : "No patients found. Click 'Register Patient' to add one."}
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB: PRESCRIPTIONS */}
              {activeTab === "prescriptions" && (
                <div className="space-y-6">
                  <div className="flex justify-between items-center">
                    <h2 className="text-xl font-black">
                      Prescriptions Directory
                    </h2>
                    {doctorInfo?.role === "DOCTOR" && (
                      <FloatingPanelRoot
                        isOpen={isAddRxOpen}
                        onOpenChange={setIsAddRxOpen}
                      >
                        <FloatingPanelTrigger
                          title="New Prescription"
                          className="flex items-center justify-center space-x-1.5 px-4 py-2 bg-zinc-950 text-white hover:bg-primary hover:text-black dark:bg-white dark:text-zinc-950 dark:hover:bg-primary dark:hover:text-black font-bold rounded-2xl text-xs shadow-md transition cursor-pointer border-none"
                        >
                          <Plus className="w-4 h-4 mr-1.5" />
                          <span>Write Prescription</span>
                        </FloatingPanelTrigger>
                        <FloatingPanelContent className="w-96 sm:w-[500px] text-left max-h-[85vh] overflow-y-auto">
                          <FloatingPanelBody>
                            <form
                              onSubmit={handleAddPrescription}
                              className="space-y-4 text-xs text-[var(--foreground)]"
                            >
                              <div>
                                <label className="text-[10px] font-bold uppercase text-slate-400">
                                  Select Patient
                                </label>
                                <select
                                  required
                                  value={rxPatientId}
                                  onChange={(e) =>
                                    setRxPatientId(e.target.value)
                                  }
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
                                <label className="text-[10px] font-bold uppercase text-slate-400">
                                  Diagnosis
                                </label>
                                <input
                                  type="text"
                                  required
                                  placeholder="e.g. Acute bronchitis, Hypertension"
                                  value={rxDiagnosis}
                                  onChange={(e) =>
                                    setRxDiagnosis(e.target.value)
                                  }
                                  className="w-full mt-1 px-4 py-2 border border-[var(--border)] rounded-2xl bg-[var(--input-bg)] text-xs focus:ring-2 focus:ring-indigo-500 outline-none"
                                />
                              </div>

                              {(doctorInfo?.role === "DOCTOR" ||
                                doctorInfo?.role === "HOSPITAL_ADMIN") && (
                                <div
                                  className={cn(
                                    "grid gap-3 border border-indigo-500/20 bg-indigo-500/5 p-3.5 rounded-2xl",
                                    isClinicMode
                                      ? "grid-cols-2"
                                      : "grid-cols-1",
                                  )}
                                >
                                  <div>
                                    <label className="text-[10px] font-bold uppercase text-slate-400">
                                      Total Charges (₹)
                                    </label>
                                    <input
                                      type="number"
                                      min={0}
                                      placeholder="e.g. 500"
                                      value={rxVisitCharges}
                                      onChange={(e) =>
                                        setRxVisitCharges(e.target.value)
                                      }
                                      className="w-full mt-1 px-3 py-1.5 border border-[var(--border)] rounded-xl bg-[var(--input-bg)] text-xs focus:ring-1 focus:ring-indigo-500 outline-none"
                                    />
                                  </div>
                                  {isClinicMode && (
                                    <>
                                      <div>
                                        <label className="text-[10px] font-bold uppercase text-slate-400">
                                          Amount Paid (₹)
                                        </label>
                                        <input
                                          type="number"
                                          min={0}
                                          placeholder="e.g. 300"
                                          value={rxAmountPaid}
                                          onChange={(e) =>
                                            setRxAmountPaid(e.target.value)
                                          }
                                          className="w-full mt-1 px-3 py-1.5 border border-[var(--border)] rounded-xl bg-[var(--input-bg)] text-xs focus:ring-1 focus:ring-indigo-500 outline-none"
                                        />
                                      </div>
                                      <div className="col-span-2 flex justify-between items-center text-[10px] font-bold text-slate-500 mt-1">
                                        <span>Calculated Due Balance:</span>
                                        <span className="text-xs text-indigo-500">
                                          ₹
                                          {Math.max(
                                            0,
                                            (parseFloat(rxVisitCharges) || 0) -
                                              (parseFloat(rxAmountPaid) || 0),
                                          ).toFixed(2)}
                                        </span>
                                      </div>
                                    </>
                                  )}
                                </div>
                              )}

                              <div>
                                <label className="text-[10px] font-bold uppercase text-slate-400">
                                  Clinical Notes / Advice
                                </label>
                                <textarea
                                  placeholder="Bed rest, drink plenty of warm water..."
                                  value={rxNotes}
                                  onChange={(e) => setRxNotes(e.target.value)}
                                  rows={2}
                                  className="w-full mt-1 px-4 py-2 border border-[var(--border)] rounded-2xl bg-[var(--input-bg)] text-xs focus:ring-2 focus:ring-indigo-500 outline-none resize-none"
                                />
                              </div>

                              <div>
                                <div className="flex justify-between items-center mb-1">
                                  <label className="text-[10px] font-bold uppercase text-slate-400">
                                    Medicines & Dosage
                                  </label>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setRxItems([
                                        ...rxItems,
                                        {
                                          medicine_name: "",
                                          medicine_id: null,
                                          dosage: "",
                                          frequency: "",
                                          duration: "",
                                          quantity: 1,
                                          instructions: "",
                                        },
                                      ])
                                    }
                                    className="text-xs text-indigo-500 font-bold hover:underline"
                                  >
                                    + Add Item
                                  </button>
                                </div>

                                <div className="space-y-3">
                                  <datalist id="medicine-suggestions">
                                    {Array.from(
                                      new Set([
                                        ...medicines.map((m) => m.name),
                                        ...COMMON_MEDICINES,
                                      ]),
                                    ).map((medName, mIdx) => (
                                      <option value={medName} key={mIdx} />
                                    ))}
                                  </datalist>
                                  {rxItems.map((item, idx) => (
                                    <div
                                      key={idx}
                                      className="border border-[var(--border)] p-3 rounded-2xl bg-[var(--card)] space-y-2 relative"
                                    >
                                      {rxItems.length > 1 && (
                                        <button
                                          type="button"
                                          onClick={() =>
                                            setRxItems(
                                              rxItems.filter(
                                                (_, i) => i !== idx,
                                              ),
                                            )
                                          }
                                          className="absolute top-2 right-2 text-red-500 hover:text-red-700 font-bold"
                                        >
                                          Remove
                                        </button>
                                      )}
                                      <div className="grid grid-cols-2 gap-2">
                                        <div>
                                          <label className="text-[9px] text-slate-400 uppercase font-bold">
                                            Medicine Name
                                          </label>
                                          <input
                                            type="text"
                                            required
                                            list="medicine-suggestions"
                                            placeholder="e.g. Paracetamol"
                                            value={item.medicine_name}
                                            onChange={(e) => {
                                              const updated = [...rxItems];
                                              updated[idx].medicine_name =
                                                e.target.value;
                                              // Check if matches an existing medicine for auto-linking
                                              const matched = medicines.find(
                                                (m) =>
                                                  m.name.toLowerCase() ===
                                                  e.target.value.toLowerCase(),
                                              );
                                              if (matched) {
                                                updated[idx].medicine_id =
                                                  matched.id;
                                              } else {
                                                updated[idx].medicine_id = null;
                                              }
                                              setRxItems(updated);
                                            }}
                                            className="w-full mt-0.5 px-3 py-1.5 border border-[var(--border)] rounded-xl bg-[var(--input-bg)] text-xs focus:ring-1 focus:ring-indigo-500 outline-none"
                                          />
                                        </div>
                                        <div>
                                          <label className="text-[9px] text-slate-400 uppercase font-bold">
                                            Dosage
                                          </label>
                                          <input
                                            type="text"
                                            placeholder="e.g. 500mg"
                                            value={item.dosage}
                                            onChange={(e) => {
                                              const updated = [...rxItems];
                                              updated[idx].dosage =
                                                e.target.value;
                                              setRxItems(updated);
                                            }}
                                            className="w-full mt-0.5 px-3 py-1.5 border border-[var(--border)] rounded-xl bg-[var(--input-bg)] text-xs focus:ring-1 focus:ring-indigo-500 outline-none"
                                          />
                                        </div>
                                      </div>

                                      <div className="grid grid-cols-3 gap-2">
                                        <div>
                                          <label className="text-[9px] text-slate-400 uppercase font-bold">
                                            Frequency
                                          </label>
                                          <input
                                            type="text"
                                            placeholder="e.g. 1-0-1"
                                            value={item.frequency}
                                            onChange={(e) => {
                                              const updated = [...rxItems];
                                              updated[idx].frequency =
                                                e.target.value;
                                              setRxItems(updated);
                                            }}
                                            className="w-full mt-0.5 px-3 py-1.5 border border-[var(--border)] rounded-xl bg-[var(--input-bg)] text-xs focus:ring-1 focus:ring-indigo-500 outline-none"
                                          />
                                        </div>
                                        <div>
                                          <label className="text-[9px] text-slate-400 uppercase font-bold">
                                            Duration
                                          </label>
                                          <input
                                            type="text"
                                            placeholder="e.g. 5 Days"
                                            value={item.duration}
                                            onChange={(e) => {
                                              const updated = [...rxItems];
                                              updated[idx].duration =
                                                e.target.value;
                                              setRxItems(updated);
                                            }}
                                            className="w-full mt-0.5 px-3 py-1.5 border border-[var(--border)] rounded-xl bg-[var(--input-bg)] text-xs focus:ring-1 focus:ring-indigo-500 outline-none"
                                          />
                                        </div>
                                        <div>
                                          <label className="text-[9px] text-slate-400 uppercase font-bold">
                                            Total Qty
                                          </label>
                                          <input
                                            type="number"
                                            required
                                            min={1}
                                            value={item.quantity}
                                            onChange={(e) => {
                                              const updated = [...rxItems];
                                              updated[idx].quantity =
                                                parseInt(e.target.value) || 0;
                                              setRxItems(updated);
                                            }}
                                            className="w-full mt-0.5 px-3 py-1.5 border border-[var(--border)] rounded-xl bg-[var(--input-bg)] text-xs focus:ring-1 focus:ring-indigo-500 outline-none"
                                          />
                                        </div>
                                      </div>

                                      <div>
                                        <label className="text-[9px] text-slate-400 uppercase font-bold">
                                          Instructions
                                        </label>
                                        <input
                                          type="text"
                                          placeholder="e.g. After meals"
                                          value={item.instructions}
                                          onChange={(e) => {
                                            const updated = [...rxItems];
                                            updated[idx].instructions =
                                              e.target.value;
                                            setRxItems(updated);
                                          }}
                                          className="w-full mt-0.5 px-3 py-1.5 border border-[var(--border)] rounded-xl bg-[var(--input-bg)] text-xs focus:ring-1 focus:ring-indigo-500 outline-none"
                                        />
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>

                              {/* Lab Requests Section */}
                              <div className="border-t border-[var(--border)] pt-4 mt-2">
                                <div className="flex justify-between items-center mb-2">
                                  <label className="text-[10px] font-bold uppercase text-slate-400">
                                    Diagnostic / Lab Tests
                                  </label>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setRxLabRequests([
                                        ...rxLabRequests,
                                        { name: "", value: "" },
                                      ])
                                    }
                                    className="text-xs text-indigo-500 font-bold hover:underline"
                                  >
                                    + Add Lab Test
                                  </button>
                                </div>
                                {rxLabRequests.length > 0 && (
                                  <div className="p-3 border border-[var(--border)] rounded-2xl bg-[var(--card)] space-y-3">
                                    <div className="text-[10px] text-amber-600 dark:text-amber-400 font-bold bg-amber-500/10 p-2.5 rounded-xl mb-1 flex items-start gap-1.5 leading-relaxed">
                                      <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-amber-500" />
                                      <span>
                                        CLINICAL BEST PRACTICE: Enter distinct,
                                        descriptive names (e.g. "X-Ray Chest"
                                        and "X-Ray Spine") instead of duplicate
                                        generic names. Identical names within a
                                        prescription will be automatically
                                        skipped by the system.
                                      </span>
                                    </div>
                                    {rxLabRequests.map((test, lIdx) => {
                                      const isDuplicate =
                                        rxLabRequests.filter(
                                          (t, i) =>
                                            i !== lIdx &&
                                            t.name.trim() !== "" &&
                                            t.name.trim().toLowerCase() ===
                                              test.name.trim().toLowerCase(),
                                        ).length > 0;
                                      const genericNames = [
                                        "x-ray",
                                        "xray",
                                        "ultrasound",
                                        "mri",
                                        "ct scan",
                                        "blood test",
                                        "biopsy",
                                        "scan",
                                        "test",
                                      ];
                                      const isGeneric = genericNames.includes(
                                        test.name.trim().toLowerCase(),
                                      );
                                      return (
                                        <div
                                          key={lIdx}
                                          className="flex items-center space-x-2"
                                        >
                                          <div className="flex-grow flex gap-2">
                                            <div className="flex-grow">
                                              <input
                                                type="text"
                                                required
                                                placeholder="e.g. CBC, Lipid Profile, Sugar level"
                                                value={test.name}
                                                onChange={(e) => {
                                                  const updated = [
                                                    ...rxLabRequests,
                                                  ];
                                                  updated[lIdx] = {
                                                    ...updated[lIdx],
                                                    name: e.target.value,
                                                  };
                                                  setRxLabRequests(updated);
                                                }}
                                                className={cn(
                                                  "w-full px-3 py-1.5 border rounded-xl bg-[var(--input-bg)] text-xs focus:ring-1 focus:ring-indigo-500 outline-none",
                                                  isDuplicate
                                                    ? "border-red-500 focus:ring-red-500"
                                                    : "border-[var(--border)]",
                                                )}
                                              />
                                              {isDuplicate && (
                                                <span className="text-[9px] text-red-500 font-bold mt-0.5 block">
                                                  Duplicate name: Use specific
                                                  names to differentiate!
                                                </span>
                                              )}
                                              {isGeneric && !isDuplicate && (
                                                <span className="text-[9px] text-amber-600 dark:text-amber-400 font-semibold mt-0.5 block">
                                                  💡 Clinical Hint: Make this
                                                  more specific to avoid
                                                  duplicate clashes.
                                                </span>
                                              )}
                                            </div>
                                            <div className="w-28">
                                              <input
                                                type="text"
                                                placeholder="Result / Value"
                                                value={test.value}
                                                onChange={(e) => {
                                                  const updated = [
                                                    ...rxLabRequests,
                                                  ];
                                                  updated[lIdx] = {
                                                    ...updated[lIdx],
                                                    value: e.target.value,
                                                  };
                                                  setRxLabRequests(updated);
                                                }}
                                                className="w-full px-3 py-1.5 border border-[var(--border)] rounded-xl bg-[var(--input-bg)] text-xs focus:ring-1 focus:ring-indigo-500 outline-none"
                                              />
                                            </div>
                                          </div>
                                          <button
                                            type="button"
                                            onClick={() =>
                                              setRxLabRequests(
                                                rxLabRequests.filter(
                                                  (_, i) => i !== lIdx,
                                                ),
                                              )
                                            }
                                            className="text-red-500 hover:text-red-700 font-bold text-xs p-1"
                                          >
                                            Remove
                                          </button>
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>

                              {/* Patient Vitals Section */}
                              <div className="border-t border-[var(--border)] pt-4 mt-2">
                                <label className="text-[10px] font-bold uppercase text-slate-400 block mb-2">
                                  Patient Vitals (Optional)
                                </label>
                                <div className="grid grid-cols-3 gap-3 border border-[var(--border)] p-3.5 rounded-2xl bg-[var(--card)]">
                                  <div>
                                    <label className="text-[9px] text-slate-400 uppercase font-bold">
                                      Weight (kg)
                                    </label>
                                    <input
                                      type="number"
                                      step="0.1"
                                      placeholder="e.g. 72.5"
                                      value={rxWeight}
                                      onChange={(e) =>
                                        setRxWeight(e.target.value)
                                      }
                                      className="w-full mt-0.5 px-3 py-1.5 border border-[var(--border)] rounded-xl bg-[var(--input-bg)] text-xs focus:ring-1 focus:ring-indigo-500 outline-none"
                                    />
                                  </div>
                                  <div>
                                    <label className="text-[9px] text-slate-400 uppercase font-bold">
                                      Blood Pressure
                                    </label>
                                    <input
                                      type="text"
                                      placeholder="e.g. 120/80"
                                      value={rxBP}
                                      onChange={(e) => setRxBP(e.target.value)}
                                      className="w-full mt-0.5 px-3 py-1.5 border border-[var(--border)] rounded-xl bg-[var(--input-bg)] text-xs focus:ring-1 focus:ring-indigo-500 outline-none"
                                    />
                                  </div>
                                  <div>
                                    <label className="text-[9px] text-slate-400 uppercase font-bold">
                                      Heart Rate / Pulse (bpm)
                                    </label>
                                    <input
                                      type="number"
                                      placeholder="e.g. 75"
                                      value={rxHR}
                                      onChange={(e) => {
                                        setRxHR(e.target.value);
                                        setRxPulse(e.target.value);
                                      }}
                                      className="w-full mt-0.5 px-3 py-1.5 border border-[var(--border)] rounded-xl bg-[var(--input-bg)] text-xs focus:ring-1 focus:ring-indigo-500 outline-none"
                                    />
                                  </div>
                                  <div>
                                    <label className="text-[9px] text-slate-400 uppercase font-bold">
                                      SpO2 (%)
                                    </label>
                                    <input
                                      type="number"
                                      placeholder="e.g. 98"
                                      value={rxSpO2}
                                      onChange={(e) =>
                                        setRxSpO2(e.target.value)
                                      }
                                      className="w-full mt-0.5 px-3 py-1.5 border border-[var(--border)] rounded-xl bg-[var(--input-bg)] text-xs focus:ring-1 focus:ring-indigo-500 outline-none"
                                    />
                                  </div>
                                  <div>
                                    <label className="text-[9px] text-slate-400 uppercase font-bold">
                                      Temp (°C)
                                    </label>
                                    <input
                                      type="number"
                                      step="0.1"
                                      placeholder="e.g. 37.0"
                                      value={rxTemp}
                                      onChange={(e) =>
                                        setRxTemp(e.target.value)
                                      }
                                      className="w-full mt-0.5 px-3 py-1.5 border border-[var(--border)] rounded-xl bg-[var(--input-bg)] text-xs focus:ring-1 focus:ring-indigo-500 outline-none"
                                    />
                                  </div>
                                </div>
                              </div>

                              <div className="flex space-x-2 pt-2 text-xs">
                                <FloatingPanelCloseButton className="w-1/2 py-2.5 rounded-2xl border border-[var(--border)] font-bold text-slate-500 hover:bg-[var(--card-hover)] transition cursor-pointer justify-center" />
                                <FloatingPanelSubmitButton
                                  label="Submit Prescription"
                                  className="w-1/2 py-2.5 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold shadow-md transition cursor-pointer ml-0 h-auto justify-center"
                                />
                              </div>
                            </form>
                          </FloatingPanelBody>
                        </FloatingPanelContent>
                      </FloatingPanelRoot>
                    )}
                  </div>

                  <div className="bg-[var(--card)] border border-[var(--border)] rounded-3xl overflow-hidden shadow-sm">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="border-b border-[var(--border)] bg-[var(--nav-bg)] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider">
                            <th className="px-6 py-4">Prescription ID</th>
                            <th className="px-6 py-4">Patient Name</th>
                            <th className="px-6 py-4">Diagnosis</th>
                            <th className="px-6 py-4">Consultation Charges</th>
                            <th className="px-6 py-4">Written By</th>
                            <th className="px-6 py-4">Date</th>
                            <th className="px-6 py-4 text-right">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {prescriptions.length > 0 ? (
                            prescriptions.map((rx) => (
                              <tr
                                key={rx.id}
                                className="border-b border-[var(--border)] hover:bg-table-row-hover transition"
                              >
                                <td className="px-6 py-4 font-semibold text-indigo-500">
                                  Rx #{rx.id}
                                </td>
                                <td className="px-6 py-4 font-bold text-sm">
                                  {rx.patient_name}
                                </td>
                                <td className="px-6 py-4 text-slate-500 dark:text-slate-400">
                                  <div className="font-medium text-slate-700 dark:text-slate-200">
                                    {rx.diagnosis || "N/A"}
                                  </div>
                                  {rx.lab_requests &&
                                    rx.lab_requests.length > 0 && (
                                      <div className="flex flex-wrap gap-1 mt-1.5">
                                        {rx.lab_requests.map(
                                          (test: string, idx: number) => (
                                            <span
                                              key={idx}
                                              className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[9px] font-bold bg-indigo-500/10 text-indigo-600 dark:bg-indigo-400/10 dark:text-indigo-400 border border-indigo-500/20"
                                            >
                                              🔬 {test}
                                            </span>
                                          ),
                                        )}
                                      </div>
                                    )}
                                </td>
                                <td className="px-6 py-4 font-bold text-indigo-500">
                                  ₹
                                  {rx.consultation_charges?.toFixed(2) ||
                                    "0.00"}
                                </td>
                                <td className="px-6 py-4 text-slate-500 dark:text-slate-400">
                                  Dr. {rx.doctor_name}
                                </td>
                                <td className="px-6 py-4 text-slate-400">
                                  {new Date(rx.created_at).toLocaleString()}
                                </td>
                                <td className="px-6 py-4 text-right">
                                  <span
                                    className={`inline-flex px-2.5 py-0.5 rounded-full text-[9px] font-bold uppercase ${
                                      rx.status === "dispensed"
                                        ? "bg-emerald-500/10 text-emerald-500"
                                        : rx.status === "partially_dispensed"
                                          ? "bg-blue-500/10 text-blue-500"
                                          : rx.status === "cancelled"
                                            ? "bg-red-500/10 text-red-500"
                                            : "bg-amber-500/10 text-amber-500"
                                    }`}
                                  >
                                    {rx.status}
                                  </span>
                                </td>
                              </tr>
                            ))
                          ) : (
                            <tr>
                              <td
                                colSpan={6}
                                className="px-6 py-12 text-center text-slate-400 font-semibold"
                              >
                                No prescriptions written yet.
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
                    <FloatingPanelRoot
                      isOpen={isAddAppointmentOpen}
                      onOpenChange={setIsAddAppointmentOpen}
                    >
                      <FloatingPanelTrigger
                        title="Book Appointment"
                        className="flex items-center space-x-1.5 px-4 py-2 bg-zinc-950 text-white hover:bg-primary hover:text-black dark:bg-white dark:text-zinc-950 dark:hover:bg-primary dark:hover:text-black font-bold rounded-2xl text-xs shadow-md transition cursor-pointer border-none"
                      >
                        <Plus className="w-4 h-4 mr-1.5" />
                        <span>Book Appointment</span>
                      </FloatingPanelTrigger>
                      <FloatingPanelContent className="w-80 sm:w-96 text-left">
                        <FloatingPanelBody>
                          <form
                            onSubmit={handleAddAppointment}
                            className="space-y-4 text-xs text-[var(--foreground)]"
                          >
                            {doctorInfo?.role !== "USER" && (
                              <div>
                                <label className="text-[10px] font-bold uppercase text-slate-400">
                                  Select Patient
                                </label>
                                <select
                                  required
                                  value={apptPatientId}
                                  onChange={(e) =>
                                    setApptPatientId(e.target.value)
                                  }
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

                            {!isClinicMode &&
                              doctorInfo?.role === "HOSPITAL_ADMIN" && (
                                <div>
                                  <label className="text-[10px] font-bold uppercase text-slate-400">
                                    Select Doctor
                                  </label>
                                  <select
                                    required
                                    value={apptDoctorId}
                                    onChange={(e) => {
                                      setApptDoctorId(e.target.value);
                                      setApptSlotId("");
                                      setAvailableSlots([]);
                                      if (apptDate) {
                                        fetchAvailableSlots(
                                          e.target.value,
                                          apptDate,
                                        );
                                      }
                                    }}
                                    className="w-full mt-1 px-4 py-2 border border-[var(--border)] rounded-2xl bg-[var(--input-bg)] text-xs focus:ring-2 focus:ring-indigo-500 outline-none"
                                  >
                                    <option value="">
                                      -- Choose Doctor --
                                    </option>
                                    {facilityDoctors.map((doc) => (
                                      <option key={doc.id} value={doc.id}>
                                        Dr. {doc.name} (
                                        {doc.specialization || "General"})
                                      </option>
                                    ))}
                                  </select>
                                </div>
                              )}

                            <div>
                              <label className="text-[10px] font-bold uppercase text-slate-400">
                                Schedule Date
                              </label>
                              <input
                                type="date"
                                required
                                value={apptDate}
                                onChange={(e) => {
                                  setApptDate(e.target.value);
                                  setApptSlotId("");
                                  if (apptDoctorId) {
                                    fetchAvailableSlots(
                                      apptDoctorId,
                                      e.target.value,
                                    );
                                  }
                                }}
                                className="w-full mt-1 px-4 py-2 border border-[var(--border)] rounded-2xl bg-[var(--input-bg)] text-xs focus:ring-2 focus:ring-indigo-500 outline-none"
                              />
                            </div>

                            {apptDoctorId && apptDate && (
                              <div className="space-y-1">
                                <label className="text-[10px] font-bold uppercase text-slate-400">
                                  Select Available Slot
                                </label>
                                {availableSlots.length > 0 ? (
                                  <div className="grid grid-cols-2 gap-2 mt-1 max-h-40 overflow-y-auto p-1">
                                    {availableSlots.map((slot) => {
                                      const isSelected =
                                        apptSlotId === slot.id.toString();
                                      const isFull =
                                        slot.booked_count >=
                                          slot.max_patients ||
                                        slot.status !== "available";
                                      return (
                                        <button
                                          key={slot.id}
                                          type="button"
                                          disabled={isFull && !isSelected}
                                          onClick={() =>
                                            setApptSlotId(slot.id.toString())
                                          }
                                          className={cn(
                                            "px-3 py-2 border rounded-xl text-center text-xs font-bold transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed",
                                            isSelected
                                              ? "bg-indigo-600 border-indigo-600 text-white"
                                              : "bg-[var(--input-bg)] border-[var(--border)] text-[var(--foreground)] hover:bg-[var(--card-hover)]",
                                          )}
                                        >
                                          <span className="block">
                                            {slot.start_time.substring(0, 5)} -{" "}
                                            {slot.end_time.substring(0, 5)}
                                          </span>
                                          <span className="block text-[8px] opacity-60">
                                            {isFull
                                              ? "Full"
                                              : `${slot.booked_count}/${slot.max_patients} Booked`}
                                          </span>
                                        </button>
                                      );
                                    })}
                                  </div>
                                ) : (
                                  <p className="text-[10px] text-red-500 italic mt-1">
                                    No slots generated for selected doctor/date.
                                  </p>
                                )}
                              </div>
                            )}

                            <div>
                              <label className="text-[10px] font-bold uppercase text-slate-400">
                                Consultation Reason / Notes
                              </label>
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
                    {/* Mobile Card List View for Appointments */}
                    <div className="block md:hidden divide-y divide-[var(--border)] bg-[var(--card)]">
                      {appointments.length > 0 ? (
                        appointments.map((ap) => (
                          <div
                            key={ap.id}
                            className="p-4 hover:bg-[var(--accent)] transition space-y-2"
                          >
                            <div className="flex justify-between items-start">
                              <span className="font-bold text-sm text-zinc-905 dark:text-zinc-50">
                                {ap.patient_name}
                              </span>
                              <span
                                className={`inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[9px] font-bold ${
                                  ap.status === "COMPLETED"
                                    ? "bg-emerald-500/10 text-emerald-500"
                                    : ap.status === "CANCELLED"
                                      ? "bg-red-500/10 text-red-500"
                                      : "bg-amber-500/10 text-amber-500"
                                }`}
                              >
                                <span>{ap.status}</span>
                              </span>
                            </div>

                            <div className="flex justify-between items-center text-xs text-slate-500 dark:text-slate-400">
                              <span>Dr. {ap.doctor_name}</span>
                              <span className="font-bold text-slate-600 dark:text-slate-300">
                                {new Date(
                                  ap.appointment_date,
                                ).toLocaleDateString()}{" "}
                                {ap.slot_time
                                  ? `(${ap.slot_time})`
                                  : `@ ${new Date(ap.appointment_date).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`}
                              </span>
                            </div>

                            <div className="flex justify-between items-center gap-2 pt-1">
                              <span className="text-[11px] text-slate-400 italic truncate max-w-[60%]">
                                {ap.reason || "General Consult"}
                              </span>

                              {ap.status !== "CANCELLED" &&
                                doctorInfo?.role !== "USER" && (
                                  <button
                                    onClick={() =>
                                      toggleAppointmentStatus(ap.id, ap.status)
                                    }
                                    className={`px-2.5 py-1.5 rounded-xl text-[10px] font-bold border transition cursor-pointer ${
                                      ap.status === "COMPLETED"
                                        ? "border-amber-500/20 text-amber-500 hover:bg-amber-500/10"
                                        : "border-emerald-500/20 text-emerald-500 hover:bg-emerald-500/10"
                                    }`}
                                  >
                                    {ap.status === "COMPLETED"
                                      ? "Mark Pending"
                                      : "Mark Completed"}
                                  </button>
                                )}
                              {ap.status === "PENDING" &&
                                doctorInfo?.role === "USER" && (
                                  <button
                                    onClick={() =>
                                      toggleAppointmentStatus(
                                        ap.id,
                                        "CANCELLED",
                                      )
                                    }
                                    className="px-2.5 py-1.5 rounded-xl text-[10px] font-bold border border-red-500/20 text-red-500 hover:bg-red-500/10 transition cursor-pointer"
                                  >
                                    Cancel Booking
                                  </button>
                                )}
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="p-8 text-center text-slate-400 font-semibold">
                          No appointments booked. Click 'Book Appointment' to
                          schedule one.
                        </div>
                      )}
                    </div>

                    {/* Desktop Table View */}
                    <div className="hidden md:block overflow-x-auto">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="border-b border-[var(--border)] bg-[var(--nav-bg)] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider">
                            <th className="px-6 py-4">Slot Date & Time</th>
                            <th className="px-6 py-4">Doctor</th>
                            <th className="px-6 py-4">Patient Name</th>
                            <th className="px-6 py-4">Reason / Notes</th>
                            <th className="px-6 py-4">Status</th>
                            <th className="px-6 py-4 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {appointments.length > 0 ? (
                            appointments.map((ap) => (
                              <tr
                                key={ap.id}
                                className="border-b border-[var(--border)] hover:bg-table-row-hover transition"
                              >
                                <td className="px-6 py-4 font-bold text-slate-500 dark:text-slate-400">
                                  {new Date(
                                    ap.appointment_date,
                                  ).toLocaleDateString()}{" "}
                                  {ap.slot_time
                                    ? `(${ap.slot_time})`
                                    : `@ ${new Date(ap.appointment_date).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`}
                                </td>
                                <td className="px-6 py-4 font-semibold text-slate-800 dark:text-slate-200">
                                  Dr. {ap.doctor_name}
                                </td>
                                <td className="px-6 py-4 font-normal text-sm">
                                  {ap.patient_name}
                                </td>
                                <td className="px-6 py-4 text-slate-400">
                                  {ap.reason || "General Consult"}
                                </td>
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
                                  {ap.status !== "CANCELLED" &&
                                    doctorInfo?.role !== "USER" && (
                                      <button
                                        onClick={() =>
                                          toggleAppointmentStatus(
                                            ap.id,
                                            ap.status,
                                          )
                                        }
                                        className={`px-3 py-1 rounded-xl text-[10px] font-bold border transition cursor-pointer ${
                                          ap.status === "COMPLETED"
                                            ? "border-amber-500/20 text-amber-500 hover:bg-amber-500/10"
                                            : "border-emerald-500/20 text-emerald-500 hover:bg-emerald-500/10"
                                        }`}
                                      >
                                        {ap.status === "COMPLETED"
                                          ? "Mark Pending"
                                          : "Mark Completed"}
                                      </button>
                                    )}
                                  {ap.status === "PENDING" &&
                                    doctorInfo?.role === "USER" && (
                                      <button
                                        onClick={() =>
                                          toggleAppointmentStatus(
                                            ap.id,
                                            "CANCELLED",
                                          )
                                        }
                                        className="px-3 py-1 rounded-xl text-[10px] font-bold border border-red-500/20 text-red-500 hover:bg-red-500/10 transition cursor-pointer"
                                      >
                                        Cancel Booking
                                      </button>
                                    )}
                                </td>
                              </tr>
                            ))
                          ) : (
                            <tr>
                              <td
                                colSpan={6}
                                className="px-6 py-12 text-center text-slate-400 font-semibold"
                              >
                                No appointments booked. Click 'Book Appointment'
                                to schedule one.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB: PHARMACY DISPENSING */}


              {/* TAB: BILLING & PRESCRIPTIONS */}
              {activeTab === "billing" && (
                <div className="space-y-6 animate-in fade-in duration-200">
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <h2 className="text-xl font-black">Billing & Pharmacy Dashboard</h2>
                    
                    {billingSubTab === "ledger" && (
                      <FloatingPanelRoot
                        isOpen={isCreateBillOpen}
                        onOpenChange={setIsCreateBillOpen}
                      >
                        <FloatingPanelTrigger
                          title="Generate Bill"
                          className="flex items-center space-x-1.5 px-4 py-2 bg-zinc-950 text-white hover:bg-primary hover:text-black dark:bg-white dark:text-zinc-950 dark:hover:bg-primary dark:hover:text-black font-bold rounded-2xl text-xs shadow-md transition cursor-pointer self-stretch sm:self-auto justify-center border-none"
                        >
                          <Plus className="w-4 h-4 mr-1.5" />
                          <span>Compose Bill</span>
                        </FloatingPanelTrigger>
                        <FloatingPanelContent className="w-80 sm:w-[32rem] max-h-[80vh] overflow-y-auto text-left">
                          <FloatingPanelBody>
                            <form
                              onSubmit={handleCreateBill}
                              className="space-y-4 text-xs text-[var(--foreground)]"
                            >
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                  <label className="text-[10px] font-bold uppercase text-slate-400">
                                    Select Patient
                                  </label>
                                  <select
                                    required
                                    value={billPatientId}
                                    onChange={(e) =>
                                      setBillPatientId(e.target.value)
                                    }
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
                                  <label className="text-[10px] font-bold uppercase text-slate-400">
                                    Diagnosis / Bill Name
                                  </label>
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
                                  <span className="text-[10px] font-bold uppercase text-slate-400">
                                    Bill Items / Other Entries
                                  </span>
                                  <button
                                    type="button"
                                    onClick={addBillItemRow}
                                    className="flex items-center space-x-1.5 text-indigo-500 hover:text-indigo-600 text-[10px] font-bold cursor-pointer"
                                  >
                                    <PlusCircle className="w-3.5 h-3.5" />
                                    <span>Add Entry</span>
                                  </button>
                                </div>

                                <div className="space-y-2.5 max-h-48 overflow-y-auto pr-1">
                                  {billItems.map((item, idx) => (
                                    <div
                                      key={idx}
                                      className="flex flex-col sm:flex-row gap-2.5 items-end sm:items-center bg-[var(--nav-bg)] p-3 rounded-2xl border border-[var(--border)]"
                                    >
                                      <div className="w-full sm:flex-1 relative">
                                        <label className="text-[8px] font-bold uppercase text-slate-400">
                                          Entry / Item Name
                                        </label>
                                        <input
                                          type="text"
                                          required
                                          placeholder="e.g. Consultation Fee, Lab Test, Procedure"
                                          value={item.item_name}
                                          onChange={(e) =>
                                            handleBillItemChange(
                                              idx,
                                              "item_name",
                                              e.target.value,
                                            )
                                          }
                                          className="w-full mt-0.5 px-3 py-1.5 border border-[var(--border)] rounded-xl bg-[var(--input-bg)] text-xs outline-none"
                                        />
                                      </div>
                                      <div className="w-20">
                                        <label className="text-[8px] font-bold uppercase text-slate-400">
                                          Qty
                                        </label>
                                        <input
                                          type="number"
                                          required
                                          value={item.quantity}
                                          onChange={(e) =>
                                            handleBillItemChange(
                                              idx,
                                              "quantity",
                                              e.target.value,
                                            )
                                          }
                                          className="w-full mt-0.5 px-3 py-1.5 border border-[var(--border)] rounded-xl bg-[var(--input-bg)] text-xs outline-none"
                                        />
                                      </div>
                                      <div className="w-28">
                                        <label className="text-[8px] font-bold uppercase text-slate-400">
                                          Price (INR)
                                        </label>
                                        <input
                                          type="number"
                                          step="0.01"
                                          required
                                          value={item.unit_price || ""}
                                          onChange={(e) =>
                                            handleBillItemChange(
                                              idx,
                                              "unit_price",
                                              e.target.value,
                                            )
                                          }
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
                                <span className="text-sm font-black">
                                  ₹{getBillTotal().toFixed(2)}
                                </span>
                              </div>

                              {/* Upfront payment details */}
                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 border-t border-[var(--border)] pt-4">
                                <div>
                                  <label className="text-[10px] font-bold uppercase text-slate-400">
                                    Upfront Amount Paid
                                  </label>
                                  <input
                                    type="number"
                                    step="0.01"
                                    placeholder="Keep blank for 0"
                                    value={billAmountPaid}
                                    onChange={(e) =>
                                      setBillAmountPaid(e.target.value)
                                    }
                                    className="w-full mt-1 px-4 py-2 border border-[var(--border)] rounded-2xl bg-[var(--input-bg)] text-xs focus:ring-2 focus:ring-indigo-500 outline-none"
                                  />
                                </div>
                                <div>
                                  <label className="text-[10px] font-bold uppercase text-slate-400">
                                    Payment Mode
                                  </label>
                                  <select
                                    value={billPayMode}
                                    onChange={(e) =>
                                      setBillPayMode(e.target.value as any)
                                    }
                                    className="w-full mt-1 px-4 py-2 border border-[var(--border)] rounded-2xl bg-[var(--input-bg)] text-xs focus:ring-2 focus:ring-indigo-500 outline-none"
                                  >
                                    <option>CASH</option>
                                    <option>ONLINE_UPI</option>
                                    <option>BANK_TRANSFER</option>
                                  </select>
                                </div>
                                <div>
                                  <label className="text-[10px] font-bold uppercase text-slate-400">
                                    Promise Due Date
                                  </label>
                                  <input
                                    type="date"
                                    value={billDueDate}
                                    onChange={(e) =>
                                      setBillDueDate(e.target.value)
                                    }
                                    className="w-full mt-1 px-4 py-2 border border-[var(--border)] rounded-2xl bg-[var(--input-bg)] text-xs focus:ring-2 focus:ring-indigo-500 outline-none"
                                  />
                                </div>
                              </div>

                              {/* Upfront Payment Remarks */}
                              <div>
                                <label className="text-[10px] font-bold uppercase text-slate-400">
                                  Remarks / Log Note
                                </label>
                                <input
                                  type="text"
                                  placeholder="Remarks"
                                  value={billPayRemarks}
                                  onChange={(e) =>
                                    setBillPayRemarks(e.target.value)
                                  }
                                  className="w-full mt-1 px-4 py-2 border border-[var(--border)] rounded-2xl bg-[var(--input-bg)] text-xs focus:ring-2 focus:ring-indigo-500 outline-none"
                                />
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
                    )}
                  </div>

                  {/* Sub-tab selection */}
                  <div className="flex border-b border-[var(--border)]">
                    <button
                      onClick={() => setBillingSubTab("queue")}
                      className={`px-4 py-2.5 text-xs font-black border-b-2 transition uppercase ${
                        billingSubTab === "queue"
                          ? "border-indigo-500 text-indigo-600 dark:text-indigo-400"
                          : "border-transparent text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                      }`}
                    >
                      Pharmacy & Billing Queue
                    </button>
                    <button
                      onClick={() => setBillingSubTab("ledger")}
                      className={`px-4 py-2.5 text-xs font-black border-b-2 transition uppercase ${
                        billingSubTab === "ledger"
                          ? "border-indigo-500 text-indigo-600 dark:text-indigo-400"
                          : "border-transparent text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                      }`}
                    >
                      Invoice History
                    </button>
                    {((doctorInfo?.role === "DOCTOR" && isClinicMode) ||
                      doctorInfo?.role === "HOSPITAL_ADMIN") && (
                      <button
                        onClick={() => setBillingSubTab("settings")}
                        className={`px-4 py-2.5 text-xs font-black border-b-2 transition uppercase ${
                          billingSubTab === "settings"
                            ? "border-indigo-500 text-indigo-600 dark:text-indigo-400"
                            : "border-transparent text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                        }`}
                      >
                        Bill Settings
                      </button>
                    )}
                  </div>

                  {/* SECTION 1: Pharmacy Queue */}
                  {billingSubTab === "queue" && (
                    <div className="space-y-6">
                      <div className="flex justify-between items-center">
                        <span className="text-xs text-slate-400 font-semibold">
                          Active prescriptions generated by doctors. Click to process.
                        </span>
                        <button
                          onClick={loadPendingPrescriptions}
                          className="px-4 py-2 border border-[var(--border)] rounded-2xl text-xs hover:bg-[var(--card-hover)] transition cursor-pointer"
                        >
                          Refresh Queue
                        </button>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {pendingPrescriptions.length > 0 ? (
                          pendingPrescriptions.map((rx) => (
                            <div
                              key={rx.id}
                              className="bg-[var(--card)] border border-[var(--border)] rounded-3xl p-5 shadow-sm flex flex-col justify-between space-y-4"
                            >
                              <div className="space-y-2">
                                <div className="flex justify-between items-center">
                                  <span className="text-[10px] font-black uppercase text-indigo-500">
                                    Rx #{rx.id}
                                  </span>
                                  <span className="text-[10px] font-bold text-slate-400 bg-amber-500/10 text-amber-500 px-2 py-0.5 rounded-full uppercase">
                                    {rx.status}
                                  </span>
                                </div>
                                <div>
                                  <h3
                                    onClick={() => {
                                      if (activeRxToDispense?.id === rx.id) {
                                        setActiveRxToDispense(null);
                                        setDispenseItems([]);
                                        setTestPrices({});
                                      } else {
                                        setActiveRxToDispense(rx);
                                        const itemsToDispense = rx.items.map(
                                          (item: any) => {
                                            const matchedMed = medicines.find(
                                              (m) =>
                                                m.name.toLowerCase() ===
                                                item.medicine_name.toLowerCase(),
                                            );
                                            return {
                                              prescription_item_id: item.id,
                                              medicine_name: item.medicine_name,
                                              medicine_id:
                                                item.medicine_id ||
                                                (matchedMed ? matchedMed.id : null),
                                              prescribed_qty: item.quantity,
                                              dosage: item.dosage,
                                              duration: item.duration || "N/A",
                                              tablets_given: item.quantity,
                                              cost_per_tablet: matchedMed ? matchedMed.price.toString() : "0",
                                              is_nil: false,
                                              nil_reason: "",
                                              line_total: matchedMed ? item.quantity * matchedMed.price : 0,
                                            };
                                          },
                                        );
                                        setDispenseItems(itemsToDispense);

                                        // Default test prices to 0
                                        const initialTestPrices: {[key: string]: string} = {};
                                        if (rx.lab_requests) {
                                          rx.lab_requests.forEach((test: string) => {
                                            initialTestPrices[test] = "0";
                                          });
                                        }
                                        setTestPrices(initialTestPrices);
                                      }
                                    }}
                                    className="text-sm font-bold text-slate-800 dark:text-slate-200 hover:text-indigo-600 cursor-pointer transition flex items-center justify-between"
                                  >
                                    <span>{rx.patient_name}</span>
                                    <span className="text-[10px] text-indigo-500 font-bold px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/50">
                                      {activeRxToDispense?.id === rx.id
                                        ? "Hide details ▲"
                                        : "View details ▼"}
                                    </span>
                                  </h3>
                                  <p className="text-[10px] text-slate-400">
                                    Dr. {rx.doctor_name}
                                  </p>
                                </div>

                                {activeRxToDispense?.id !== rx.id && (
                                  <div className="border-t border-[var(--border)] pt-2 mt-2 space-y-1">
                                    {rx.items && rx.items.length > 0 && (
                                      <>
                                        <span className="text-[9px] font-black uppercase text-slate-400 block">
                                          Prescribed Meds:
                                        </span>
                                        {rx.items.map((it: any) => (
                                          <div
                                            key={it.id}
                                            className="text-xs flex justify-between text-slate-500 dark:text-slate-400"
                                          >
                                            <span>
                                              {it.medicine_name} ({it.dosage})
                                            </span>
                                            <span className="font-semibold">
                                              x{it.quantity}
                                            </span>
                                          </div>
                                        ))}
                                      </>
                                    )}
                                    {rx.lab_requests && rx.lab_requests.length > 0 && (
                                      <div className="pt-1">
                                        <span className="text-[9px] font-black uppercase text-slate-400 block">
                                          Requested Tests:
                                        </span>
                                        {rx.lab_requests.map((test: string, idx: number) => (
                                          <div key={idx} className="text-xs text-slate-500 dark:text-slate-400">
                                            • {test}
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>

                              {activeRxToDispense?.id === rx.id ? (
                                <form
                                  onSubmit={async (e) => {
                                    e.preventDefault();
                                    if (isSubmitting) return;
                                    setIsSubmitting(true);
                                    try {
                                      await fetchAPI("/api/pharmacy/dispense", {
                                        method: "POST",
                                        body: JSON.stringify({
                                          prescription_id: rx.id,
                                          amount_paid: parseFloat(dispenseAmountPaid) || 0,
                                          consultation_charges: rx.consultation_charges || 0,
                                          items: dispenseItems.map((item) => ({
                                            prescription_item_id: item.prescription_item_id,
                                            medicine_id: item.medicine_id,
                                            tablets_given: parseInt(item.tablets_given as any) || 0,
                                            cost_per_tablet: parseFloat(item.cost_per_tablet as any) || 0,
                                            is_nil: item.is_nil,
                                            nil_reason: item.nil_reason,
                                          })),
                                          tests: rx.lab_requests?.map((t: string) => ({
                                            name: t,
                                            amount: parseFloat(testPrices[t] || "0") || 0,
                                          })) || [],
                                        }),
                                      });
                                      setToast({
                                        message: "Combined bill generated and finalized!",
                                        type: "success",
                                      });
                                      setActiveRxToDispense(null);
                                      setDispenseItems([]);
                                      setTestPrices({});
                                      setDispenseAmountPaid("");
                                      loadPendingPrescriptions();
                                      loadRecentBills();
                                      loadPrescriptions();
                                      loadPatients();
                                      loadMedicines();
                                      if (currentPatientData) {
                                        loadPatientDetails(currentPatientData.patient.id);
                                      }
                                    } catch (err: any) {
                                      setToast({
                                        message: err.message || "Failed to finalize bill",
                                        type: "error",
                                      });
                                    } finally {
                                      setIsSubmitting(false);
                                    }
                                  }}
                                  className="mt-4 border-t border-[var(--border)] pt-4 space-y-4 animate-in fade-in slide-in-from-top-2 duration-200"
                                >
                                  <p className="text-[10px] text-slate-400 uppercase font-black">
                                    Diagnosis: {rx.diagnosis || "N/A"}
                                  </p>
                                  <div className="space-y-3">
                                    {/* Consultation Fee Section */}
                                    <div className="p-3 rounded-2xl border border-[var(--border)] bg-[var(--nav-bg)] flex justify-between items-center">
                                      <div>
                                        <span className="font-bold text-slate-800 dark:text-slate-200 block text-xs">
                                          Consultation Fee
                                        </span>
                                        <span className="text-[9px] text-slate-400">
                                          Written by Doctor
                                        </span>
                                      </div>
                                      <span className="text-xs font-black text-slate-800 dark:text-slate-200">
                                        ₹{rx.consultation_charges?.toFixed(2) || "0.00"}
                                      </span>
                                    </div>

                                    {/* Medicines Section */}
                                    {dispenseItems.map((item, idx) => (
                                      <div
                                        key={idx}
                                        className={`p-3 rounded-2xl border border-[var(--border)] bg-[var(--nav-bg)] space-y-2.5 ${item.is_nil ? "opacity-60 border-red-500/20 bg-red-500/5" : ""}`}
                                      >
                                        <div className="flex flex-wrap items-center gap-2">
                                          <span className="px-2 py-0.5 bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 text-[10px] font-black rounded-lg border border-indigo-200 dark:border-indigo-800/40">
                                            {item.dosage} | {item.duration}
                                          </span>
                                          <span className="font-bold text-slate-800 dark:text-slate-200">
                                            {item.medicine_name}
                                          </span>
                                          <span className="text-[10px] text-slate-400">
                                            Prescribed: {item.prescribed_qty}
                                          </span>
                                        </div>

                                        <div className="flex items-center justify-between gap-2">
                                          <div className="flex items-center space-x-1.5">
                                            <span className="text-[10px] font-bold text-slate-400 uppercase">
                                              Amt:
                                            </span>
                                            <input
                                              type="text"
                                              placeholder="0.00"
                                              value={item.cost_per_tablet}
                                              disabled={item.is_nil}
                                              onChange={(e) => {
                                                const val = e.target.value;
                                                if (
                                                  val === "" ||
                                                  /^[0-9]*\.?[0-9]*$/.test(val)
                                                ) {
                                                  const updated = [
                                                    ...dispenseItems,
                                                  ];
                                                  updated[idx].cost_per_tablet =
                                                    val;
                                                  const price =
                                                    parseFloat(val) || 0;
                                                  updated[idx].line_total =
                                                    item.tablets_given * price;
                                                  setDispenseItems(updated);
                                                }
                                              }}
                                              className="w-20 px-2 py-1 border border-[var(--border)] rounded-xl bg-[var(--input-bg)] text-xs focus:ring-1 focus:ring-indigo-500 outline-none text-center"
                                            />
                                          </div>

                                          <div className="flex items-center space-x-1.5">
                                            <span className="text-[10px] font-bold text-slate-400 uppercase">
                                              Qty:
                                            </span>
                                            <input
                                              type="number"
                                              min={0}
                                              required
                                              disabled={item.is_nil}
                                              value={item.tablets_given}
                                              onChange={(e) => {
                                                const val =
                                                  parseInt(e.target.value) || 0;
                                                const updated = [...dispenseItems];
                                                updated[idx].tablets_given = val;
                                                const price =
                                                  parseFloat(
                                                    item.cost_per_tablet,
                                                  ) || 0;
                                                updated[idx].line_total =
                                                  val * price;
                                                setDispenseItems(updated);
                                              }}
                                              className="w-14 px-2 py-1 border border-[var(--border)] rounded-xl bg-[var(--input-bg)] text-xs focus:ring-1 focus:ring-indigo-500 outline-none text-center"
                                            />
                                          </div>

                                          <div className="flex items-center space-x-1">
                                            <input
                                              type="checkbox"
                                              id={`nil-${rx.id}-${idx}`}
                                              checked={item.is_nil}
                                              onChange={(e) => {
                                                const checked = e.target.checked;
                                                const updated = [...dispenseItems];
                                                updated[idx].is_nil = checked;
                                                if (checked) {
                                                  updated[idx].line_total = 0;
                                                } else {
                                                  const price =
                                                    parseFloat(
                                                      item.cost_per_tablet,
                                                    ) || 0;
                                                  updated[idx].line_total =
                                                    item.tablets_given * price;
                                                }
                                                setDispenseItems(updated);
                                              }}
                                              className="rounded text-indigo-600 focus:ring-indigo-500 h-3.5 w-3.5 cursor-pointer"
                                            />
                                            <label
                                              htmlFor={`nil-${rx.id}-${idx}`}
                                              className="text-[10px] font-black text-red-500 uppercase cursor-pointer"
                                            >
                                              NIL
                                            </label>
                                          </div>
                                        </div>

                                        {item.is_nil && (
                                          <input
                                            type="text"
                                            required
                                            placeholder="Reason (e.g. Out of Stock)"
                                            value={item.nil_reason}
                                            onChange={(e) => {
                                              const updated = [...dispenseItems];
                                              updated[idx].nil_reason =
                                                e.target.value;
                                              setDispenseItems(updated);
                                            }}
                                            className="w-full px-2 py-1 border border-red-300 rounded-lg bg-[var(--input-bg)] text-[10px] focus:ring-1 focus:ring-red-500 outline-none"
                                          />
                                        )}
                                      </div>
                                    ))}

                                    {/* Tests Section */}
                                    {rx.lab_requests && rx.lab_requests.map((testName: string, testIdx: number) => (
                                      <div
                                        key={testIdx}
                                        className="p-3 rounded-2xl border border-[var(--border)] bg-[var(--nav-bg)] space-y-2.5"
                                      >
                                        <div className="flex justify-between items-center">
                                          <span className="font-bold text-slate-800 dark:text-slate-200 text-xs">
                                            {testName}
                                          </span>
                                          <span className="text-[9px] text-slate-400 font-bold uppercase">
                                            Test / Lab Request
                                          </span>
                                        </div>
                                        <div className="flex items-center space-x-1.5">
                                          <span className="text-[10px] font-bold text-slate-400 uppercase">
                                            Amt:
                                          </span>
                                          <input
                                            type="text"
                                            placeholder="0"
                                            value={testPrices[testName] || "0"}
                                            onChange={(e) => {
                                              const val = e.target.value;
                                              if (
                                                val === "" ||
                                                /^[0-9]*\.?[0-9]*$/.test(val)
                                              ) {
                                                setTestPrices((prev) => ({
                                                  ...prev,
                                                  [testName]: val,
                                                }));
                                              }
                                            }}
                                            className="w-24 px-2 py-1 border border-[var(--border)] rounded-xl bg-[var(--input-bg)] text-xs focus:ring-1 focus:ring-indigo-500 outline-none text-center"
                                          />
                                        </div>
                                      </div>
                                    ))}
                                  </div>

                                  <div className="flex justify-between items-center text-[10px] font-bold text-slate-400 pt-2 border-t border-[var(--border)]">
                                    <span>CALCULATED GRAND TOTAL:</span>
                                    <span className="text-base font-black text-slate-800 dark:text-slate-200">
                                      ₹
                                      {(
                                        dispenseItems.reduce(
                                          (acc, it) =>
                                            acc + (it.is_nil ? 0 : it.line_total),
                                          0,
                                        ) +
                                        (rx.consultation_charges || 0) +
                                        Object.values(testPrices).reduce(
                                          (acc, val) => acc + (parseFloat(val) || 0),
                                          0,
                                        )
                                      ).toFixed(2)}
                                    </span>
                                  </div>

                                  <div className="space-y-1">
                                    <label className="text-[10px] font-bold uppercase text-slate-400">
                                      Amount Paid Upfront (INR)
                                    </label>
                                    <input
                                      type="text"
                                      placeholder="0.00"
                                      value={dispenseAmountPaid}
                                      onChange={(e) => {
                                        const val = e.target.value;
                                        if (
                                          val === "" ||
                                          /^[0-9]*\.?[0-9]*$/.test(val)
                                        ) {
                                          setDispenseAmountPaid(val);
                                        }
                                      }}
                                      className="w-full px-3 py-1.5 border border-[var(--border)] rounded-xl bg-[var(--input-bg)] text-xs focus:ring-2 focus:ring-indigo-500 outline-none text-center font-bold"
                                    />
                                  </div>

                                  <button
                                    type="submit"
                                    disabled={isSubmitting}
                                    className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-bold text-xs shadow-md transition cursor-pointer text-center disabled:opacity-50"
                                  >
                                    {isSubmitting
                                      ? "Processing..."
                                      : "Dispense, Save Bill & Send WhatsApp"}
                                  </button>
                                </form>
                              ) : (
                                <button
                                  onClick={() => {
                                    setActiveRxToDispense(rx);
                                    const itemsToDispense = rx.items.map(
                                      (item: any) => {
                                        const matchedMed = medicines.find(
                                          (m) =>
                                            m.name.toLowerCase() ===
                                            item.medicine_name.toLowerCase(),
                                        );
                                        return {
                                          prescription_item_id: item.id,
                                          medicine_name: item.medicine_name,
                                          medicine_id:
                                            item.medicine_id ||
                                            (matchedMed ? matchedMed.id : null),
                                          prescribed_qty: item.quantity,
                                          dosage: item.dosage,
                                          duration: item.duration || "N/A",
                                          tablets_given: item.quantity,
                                          cost_per_tablet: matchedMed ? matchedMed.price.toString() : "0",
                                          is_nil: false,
                                          nil_reason: "",
                                          line_total: matchedMed ? item.quantity * matchedMed.price : 0,
                                        };
                                      },
                                    );
                                    setDispenseItems(itemsToDispense);

                                    const initialTestPrices: {[key: string]: string} = {};
                                    if (rx.lab_requests) {
                                      rx.lab_requests.forEach((test: string) => {
                                        initialTestPrices[test] = "0";
                                      });
                                    }
                                    setTestPrices(initialTestPrices);
                                  }}
                                  className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-bold text-xs shadow-md transition cursor-pointer text-center"
                                >
                                  Process & Bill
                                </button>
                              )}
                            </div>
                          ))
                        ) : (
                          <div className="col-span-full bg-[var(--card)] border border-[var(--border)] rounded-3xl p-12 text-center text-slate-400 font-semibold">
                            No prescriptions in the pending queue.
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* SECTION 2: Invoice History Ledger */}
                  {billingSubTab === "ledger" && (
                    <div className="space-y-6 animate-in fade-in duration-200">
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

                      <div className="bg-[var(--card)] border border-[var(--border)] rounded-3xl overflow-hidden transition-all shadow-sm">
                        {/* Mobile Card List View for Billings */}
                        <div className="block md:hidden divide-y divide-[var(--border)] bg-[var(--card)]">
                          {recentBills.length > 0 ? (
                            recentBills.map((bill) => (
                              <div
                                key={bill.id}
                                onClick={() => {
                                  setActiveTab("patients");
                                  setViewState({ type: "bill", billId: bill.id });
                                }}
                                className="p-4 hover:bg-[var(--accent)] transition cursor-pointer space-y-2"
                              >
                                <div className="flex justify-between items-start">
                                  <span className="font-bold text-sm text-zinc-900 dark:text-zinc-100">
                                    {bill.patient_name}
                                  </span>
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
                                </div>

                                <div className="flex justify-between items-center text-xs text-slate-500 dark:text-slate-400">
                                  <span>
                                    Total: ₹{bill.total_amount.toFixed(2)}
                                  </span>
                                  <span className="font-bold text-red-500">
                                    Dues: ₹{bill.remaining_amount.toFixed(2)}
                                  </span>
                                </div>

                                <div className="flex justify-between items-center text-[10px] text-slate-400 pt-1">
                                  <span className="truncate max-w-[60%]">
                                    {bill.description}
                                  </span>
                                  <span>
                                    {new Date(bill.created_at).toLocaleDateString()}
                                  </span>
                                </div>
                              </div>
                            ))
                          ) : (
                            <div className="p-8 text-center text-slate-400 font-semibold">
                              {billsLoading
                                ? "Loading bills..."
                                : "No billing records found."}
                            </div>
                          )}
                        </div>

                        {/* Desktop Table View */}
                        <div className="hidden md:block overflow-x-auto">
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
                                    onClick={() => {
                                      setActiveTab("patients");
                                      setViewState({
                                        type: "bill",
                                        billId: bill.id,
                                      });
                                    }}
                                    className="border-b border-[var(--border)] hover:bg-table-row-hover transition cursor-pointer"
                                  >
                                    <td className="px-6 py-4 font-semibold text-slate-500 dark:text-slate-400">
                                      {new Date(
                                        bill.created_at,
                                      ).toLocaleDateString()}
                                    </td>
                                    <td className="px-6 py-4 font-normal">
                                      {bill.patient_name}
                                    </td>
                                    <td className="px-6 py-4 text-slate-400 max-w-xs truncate">
                                      {bill.description}
                                    </td>
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
                                  <td
                                    colSpan={6}
                                    className="px-6 py-12 text-center text-slate-400 font-semibold"
                                  >
                                    {billsLoading
                                      ? "Loading bills..."
                                      : "No billing records found."}
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
                            onClick={() =>
                              loadRecentBills(
                                billSearchQuery,
                                billsOffset + 20,
                                true,
                              )
                            }
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

                  {/* SECTION 3: Bill Configurations Settings */}
                  {billingSubTab === "settings" && (
                    <div className="bg-[var(--card)] border border-[var(--border)] rounded-3xl p-6 shadow-sm max-w-xl space-y-6 animate-in fade-in duration-200">
                      <div>
                        <h3 className="text-sm font-black text-slate-800 dark:text-slate-200">
                          Bill Header Configuration
                        </h3>
                        <p className="text-xs text-slate-400">
                          Configure your clinic/hospital name, address, and phone number printed on invoice headers.
                        </p>
                      </div>
                      <form
                        onSubmit={async (e) => {
                          e.preventDefault();
                          setIsSubmitting(true);
                          try {
                            await fetchAPI("/api/facilities", {
                              method: "PUT",
                              body: JSON.stringify({
                                id: doctorInfo?.active_facility_id,
                                name: billingSettingsName.trim(),
                                address: billingSettingsAddress.trim(),
                                phone: billingSettingsPhone.trim(),
                              }),
                            });
                            setToast({
                              message: "Bill settings updated successfully!",
                              type: "success",
                            });
                            
                            // Update local doctorInfo facilities mapping so it refreshes immediately in context
                            setDoctorInfo((prev) => {
                              if (!prev) return null;
                              const updatedFacs = prev.facilities?.map((f) => {
                                if (f.id === prev.active_facility_id) {
                                  return {
                                    ...f,
                                    name: billingSettingsName.trim(),
                                    address: billingSettingsAddress.trim(),
                                    phone: billingSettingsPhone.trim(),
                                  };
                                }
                                return f;
                              });
                              return {
                                ...prev,
                                facilities: updatedFacs,
                              };
                            });
                          } catch (err: any) {
                            setToast({
                              message: err.message || "Failed to save settings",
                              type: "error",
                            });
                          } finally {
                            setIsSubmitting(false);
                          }
                        }}
                        className="space-y-4 text-xs"
                      >
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold uppercase text-slate-400">
                            Clinic / Hospital Name
                          </label>
                          <input
                            type="text"
                            required
                            value={billingSettingsName}
                            onChange={(e) => setBillingSettingsName(e.target.value)}
                            className="w-full px-4 py-2 border border-[var(--border)] rounded-2xl bg-[var(--input-bg)] text-xs focus:ring-2 focus:ring-indigo-500 outline-none"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold uppercase text-slate-400">
                            Address Line
                          </label>
                          <textarea
                            rows={3}
                            required
                            value={billingSettingsAddress}
                            onChange={(e) => setBillingSettingsAddress(e.target.value)}
                            className="w-full px-4 py-2 border border-[var(--border)] rounded-2xl bg-[var(--input-bg)] text-xs focus:ring-2 focus:ring-indigo-500 outline-none resize-none"
                            placeholder="e.g. Opposite IIMB, 154/11, Amalodbhavi Nagar, Panduranga Nagar, Bangalore - 560076 (India)"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold uppercase text-slate-400">
                            Doctor / Admin Contact Phone
                          </label>
                          <input
                            type="text"
                            required
                            value={billingSettingsPhone}
                            onChange={(e) => setBillingSettingsPhone(e.target.value)}
                            className="w-full px-4 py-2 border border-[var(--border)] rounded-2xl bg-[var(--input-bg)] text-xs focus:ring-2 focus:ring-indigo-500 outline-none"
                            placeholder="e.g. +91-80-26304050"
                          />
                        </div>
                        <button
                          type="submit"
                          disabled={isSubmitting}
                          className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-2xl text-xs shadow-md transition disabled:opacity-50 cursor-pointer"
                        >
                          {isSubmitting ? "Saving..." : "Save Settings"}
                        </button>
                      </form>
                    </div>
                  )}
                </div>
              )}

              {/* TAB: PHARMACY STOCK */}
              {activeTab === "medicines" && (
                <div className="space-y-6">
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <h2 className="text-xl font-black">Medicine Catalog</h2>
                    <FloatingPanelRoot
                      isOpen={isAddMedicineOpen}
                      onOpenChange={setIsAddMedicineOpen}
                    >
                      <FloatingPanelTrigger
                        title="Register New Medicine"
                        className="flex items-center space-x-1.5 px-4 py-2 bg-zinc-950 text-white hover:bg-zinc-800 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-100 font-bold rounded-2xl text-xs shadow-md transition cursor-pointer self-stretch sm:self-auto justify-center border-none"
                      >
                        <Plus className="w-4 h-4 mr-1.5" />
                        <span>Add New Medicine</span>
                      </FloatingPanelTrigger>
                      <FloatingPanelContent className="w-80 sm:w-96 text-left">
                        <FloatingPanelBody>
                          <form
                            onSubmit={handleAddMedicine}
                            className="space-y-4 text-xs text-[var(--foreground)]"
                          >
                            <div>
                              <label className="text-[10px] font-bold uppercase text-slate-400">
                                Medicine Name
                              </label>
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
                                <label className="text-[10px] font-bold uppercase text-slate-400">
                                  Price Per Unit
                                </label>
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
                                <label className="text-[10px] font-bold uppercase text-slate-400">
                                  Initial Stock
                                </label>
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
                      <span className="text-[10px] font-bold uppercase text-slate-400 whitespace-nowrap">
                        Sort By:
                      </span>
                      {(["name", "stock", "availability"] as const).map(
                        (field) => (
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
                              <ArrowUpDown
                                className={`w-3 h-3 transition-transform ${medSortAsc ? "" : "rotate-180"}`}
                              />
                            )}
                          </button>
                        ),
                      )}
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
                                <tr
                                  key={med.id}
                                  className="border-b border-[var(--border)] hover:bg-table-row-hover transition"
                                >
                                  <td className="px-6 py-4 font-black text-sm">
                                    {isEditing ? (
                                      <input
                                        type="text"
                                        value={editMedName}
                                        onChange={(e) =>
                                          setEditMedName(e.target.value)
                                        }
                                        className="px-2.5 py-1 border border-[var(--border)] rounded-xl bg-[var(--input-bg)] text-xs font-semibold focus:ring-1 focus:ring-indigo-500 outline-none w-full max-w-[200px]"
                                      />
                                    ) : (
                                      med.name
                                    )}
                                  </td>
                                  <td className="px-6 py-4 font-bold text-slate-500 dark:text-slate-400">
                                    {isEditing ? (
                                      <div className="flex items-center space-x-1">
                                        <span className="text-slate-400">
                                          ₹
                                        </span>
                                        <input
                                          type="number"
                                          step="0.01"
                                          value={editMedPrice}
                                          onChange={(e) =>
                                            setEditMedPrice(e.target.value)
                                          }
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
                                        onChange={(e) =>
                                          setEditMedStock(e.target.value)
                                        }
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
                                      {med.stock > 10
                                        ? "Available"
                                        : med.stock > 0
                                          ? "Low Stock"
                                          : "Out of stock"}
                                    </span>
                                  </td>
                                  <td className="px-6 py-4 text-right">
                                    {isEditing ? (
                                      <div className="flex items-center justify-end space-x-2">
                                        <button
                                          onClick={() =>
                                            handleUpdateMedicine(med.id)
                                          }
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
                                            setEditMedPrice(
                                              med.price.toString(),
                                            );
                                            setEditMedStock(
                                              med.stock.toString(),
                                            );
                                          }}
                                          className="p-1.5 text-slate-500 hover:bg-slate-500/10 dark:text-slate-400 rounded-xl cursor-pointer"
                                          title="Edit Medicine"
                                        >
                                          <Pencil className="w-4 h-4" />
                                        </button>
                                        <button
                                          onClick={() =>
                                            handleDeleteMedicine(
                                              med.id,
                                              med.name,
                                            )
                                          }
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
                              <td
                                colSpan={5}
                                className="px-6 py-12 text-center text-slate-400 font-semibold"
                              >
                                {medSearchQuery
                                  ? "No medicines matching your search."
                                  : "Pharmacy inventory is empty. Click 'Add New Medicine' to register stock."}
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
                        <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                          Total Patients Treated
                        </span>
                        <h3 className="text-3xl font-black mt-1">
                          {analytics?.patients_weekly?.reduce(
                            (s, p) => s + p.value,
                            0,
                          ) || 0}
                        </h3>
                        <p className="text-[10px] text-indigo-500 font-semibold mt-1">
                          Completed slots (past 7 days)
                        </p>
                      </div>
                      <div className="p-3.5 bg-indigo-500/10 text-indigo-500 rounded-2xl">
                        <Users className="w-6 h-6" />
                      </div>
                    </div>

                    <div className="bg-[var(--card)] border border-[var(--border)] rounded-3xl p-6 shadow-sm flex items-center justify-between">
                      <div>
                        <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                          Revenue (Past 30 Days)
                        </span>
                        <h3 className="text-3xl font-black mt-1 text-emerald-500">
                          ₹
                          {(
                            analytics?.revenue_daily?.reduce(
                              (s, r) => s + r.value,
                              0,
                            ) || 0
                          ).toLocaleString("en-IN")}
                        </h3>
                        <p className="text-[10px] text-emerald-500 font-semibold mt-1">
                          Gross Invoiced
                        </p>
                      </div>
                      <div className="p-3.5 bg-emerald-500/10 text-emerald-500 rounded-2xl">
                        <DollarSign className="w-6 h-6" />
                      </div>
                    </div>

                    <div className="bg-[var(--card)] border border-[var(--border)] rounded-3xl p-6 shadow-sm flex items-center justify-between">
                      <div>
                        <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                          Upcoming Agenda Slots
                        </span>
                        <h3 className="text-3xl font-black mt-1 text-amber-500">
                          {analytics?.appointments_future?.reduce(
                            (s, a) => s + a.value,
                            0,
                          ) || 0}
                        </h3>
                        <p className="text-[10px] text-amber-500 font-semibold mt-1">
                          Next 14 Days
                        </p>
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
                          <h4 className="text-sm font-black text-[var(--foreground)] dark:text-white">
                            Patients Treated (Completed)
                          </h4>
                          <p className="text-[10px] text-[var(--text-muted)] dark:text-zinc-400">
                            Historical performance data
                          </p>
                        </div>
                        <div className="flex border border-[var(--border)] dark:border-zinc-800 rounded-xl overflow-hidden text-[10px] font-bold">
                          {(["weekly", "monthly", "yearly"] as const).map(
                            (t) => (
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
                            ),
                          )}
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
                          <div className="text-xs text-[var(--text-muted)] dark:text-zinc-400">
                            Loading chart data...
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Daily Revenue Line Chart */}
                    <div className="bg-white border border-[var(--border)] dark:bg-zinc-900 dark:border-zinc-800 rounded-3xl p-6 shadow-sm space-y-4 text-[var(--foreground)] dark:text-white">
                      <div>
                        <h4 className="text-sm font-black text-[var(--foreground)] dark:text-white">
                          Daily Revenue Trend
                        </h4>
                        <p className="text-[10px] text-[var(--text-muted)] dark:text-zinc-400">
                          Invoices generated in the past 30 days
                        </p>
                      </div>

                      <div className="h-64 flex items-center justify-center p-2">
                        {analytics?.revenue_daily ? (
                          renderLineChart(analytics.revenue_daily)
                        ) : (
                          <div className="text-xs text-[var(--text-muted)] dark:text-zinc-400">
                            Loading chart data...
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Future Appointments Histogram */}
                    <div className="bg-white border border-[var(--border)] dark:bg-zinc-900 dark:border-zinc-800 rounded-3xl p-6 shadow-sm lg:col-span-2 space-y-4 text-[var(--foreground)] dark:text-white">
                      <div>
                        <h4 className="text-sm font-black text-[var(--foreground)] dark:text-white">
                          Upcoming Booking Density (Next 14 Days)
                        </h4>
                        <p className="text-[10px] text-[var(--text-muted)] dark:text-zinc-400">
                          Future slots scheduled date-wise
                        </p>
                      </div>

                      <div className="h-64 flex items-center justify-center p-2">
                        {analytics?.appointments_future ? (
                          renderHistogram(analytics.appointments_future)
                        ) : (
                          <div className="text-xs text-[var(--text-muted)] dark:text-zinc-400">
                            Loading chart data...
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB: DOCTOR ANALYTICS */}
              {activeTab === "doctor-analytics" && (
                <div className="space-y-8">
                  {/* Select Doctor Header Card */}
                  <div className="bg-[var(--card)] border border-[var(--border)] rounded-3xl p-6 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div>
                      <h2 className="text-xl font-black">Doctor Insights & Analytics</h2>
                      <p className="text-xs text-[var(--text-muted)] dark:text-zinc-400">
                        Select a doctor from the hospital staff directory to view their performance metrics for the active workspace.
                      </p>
                    </div>
                    <div className="w-full md:w-64">
                      <select
                        value={selectedDoctorForAnalytics}
                        onChange={(e) => {
                          const docId = e.target.value;
                          setSelectedDoctorForAnalytics(docId);
                          loadDoctorAnalytics(docId);
                        }}
                        className="w-full px-4 py-2.5 border border-[var(--border)] rounded-2xl bg-[var(--input-bg)] text-xs focus:ring-2 focus:ring-indigo-500 outline-none cursor-pointer"
                      >
                        <option value="">-- Select a Doctor --</option>
                        {facilityDoctors.map((doc) => (
                          <option key={doc.id} value={doc.id}>
                            {doc.name} {doc.specialization ? `(${doc.specialization})` : ""}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {loadingDoctorAnalytics ? (
                    <div className="flex flex-col items-center justify-center py-20 space-y-4">
                      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600 animate-duration-1000"></div>
                      <p className="text-xs text-[var(--text-muted)]">Fetching doctor analytics...</p>
                    </div>
                  ) : doctorAnalytics ? (
                    <>
                      {/* 1. Summary Cards */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                        <div className="bg-[var(--card)] border border-[var(--border)] rounded-3xl p-6 shadow-sm flex items-center justify-between">
                          <div>
                            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                              Total Patients Treated
                            </span>
                            <h3 className="text-3xl font-black mt-1">
                              {doctorAnalytics.patients_weekly?.reduce(
                                (s, p) => s + p.value,
                                0,
                              ) || 0}
                            </h3>
                            <p className="text-[10px] text-indigo-500 font-semibold mt-1">
                              Based on prescriptions (past 7 days)
                            </p>
                          </div>
                          <div className="p-3.5 bg-indigo-500/10 text-indigo-500 rounded-2xl">
                            <Users className="w-6 h-6" />
                          </div>
                        </div>

                        <div className="bg-[var(--card)] border border-[var(--border)] rounded-3xl p-6 shadow-sm flex items-center justify-between">
                          <div>
                            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                              Revenue (Past 30 Days)
                            </span>
                            <h3 className="text-3xl font-black mt-1 text-emerald-500">
                              ₹
                              {(
                                doctorAnalytics.revenue_daily?.reduce(
                                  (s, r) => s + r.value,
                                  0,
                                ) || 0
                              ).toLocaleString("en-IN")}
                            </h3>
                            <p className="text-[10px] text-emerald-500 font-semibold mt-1">
                              Gross Invoiced
                            </p>
                          </div>
                          <div className="p-3.5 bg-emerald-500/10 text-emerald-500 rounded-2xl">
                            <DollarSign className="w-6 h-6" />
                          </div>
                        </div>

                        <div className="bg-[var(--card)] border border-[var(--border)] rounded-3xl p-6 shadow-sm flex items-center justify-between">
                          <div>
                            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                              Upcoming Agenda Slots
                            </span>
                            <h3 className="text-3xl font-black mt-1 text-amber-500">
                              {doctorAnalytics.appointments_future?.reduce(
                                (s, a) => s + a.value,
                                0,
                              ) || 0}
                            </h3>
                            <p className="text-[10px] text-amber-500 font-semibold mt-1">
                              Next 14 Days
                            </p>
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
                              <h4 className="text-sm font-black text-[var(--foreground)] dark:text-white">
                                Patients Treated (Prescriptions)
                              </h4>
                              <p className="text-[10px] text-[var(--text-muted)] dark:text-zinc-400">
                                Historical performance data
                              </p>
                            </div>
                            <div className="flex border border-[var(--border)] dark:border-zinc-800 rounded-xl overflow-hidden text-[10px] font-bold">
                              {(["weekly", "monthly", "yearly"] as const).map(
                                (t) => (
                                  <button
                                    key={t}
                                    onClick={() => setDoctorPatientTimeframe(t)}
                                    className={`px-3 py-1.5 cursor-pointer uppercase transition ${
                                      doctorPatientTimeframe === t
                                        ? "bg-indigo-600 text-white"
                                        : "hover:bg-[var(--card-hover)] text-[var(--text-muted)] dark:text-zinc-400 dark:hover:bg-zinc-800"
                                    }`}
                                  >
                                    {t}
                                  </button>
                                ),
                              )}
                            </div>
                          </div>

                          <div className="h-64 flex items-center justify-center p-2">
                            {doctorPatientTimeframe === "weekly" ? (
                              renderHistogram(doctorAnalytics.patients_weekly)
                            ) : doctorPatientTimeframe === "monthly" ? (
                              renderHistogram(doctorAnalytics.patients_monthly)
                            ) : (
                              renderHistogram(doctorAnalytics.patients_yearly)
                            )}
                          </div>
                        </div>

                        {/* Daily Revenue Line Chart */}
                        <div className="bg-white border border-[var(--border)] dark:bg-zinc-900 dark:border-zinc-800 rounded-3xl p-6 shadow-sm space-y-4 text-[var(--foreground)] dark:text-white">
                          <div>
                            <h4 className="text-sm font-black text-[var(--foreground)] dark:text-white">
                              Daily Revenue Trend
                            </h4>
                            <p className="text-[10px] text-[var(--text-muted)] dark:text-zinc-400">
                              Invoices generated in the past 30 days
                            </p>
                          </div>

                          <div className="h-64 flex items-center justify-center p-2">
                            {doctorAnalytics.revenue_daily ? (
                              renderLineChart(doctorAnalytics.revenue_daily)
                            ) : (
                              <div className="text-xs text-[var(--text-muted)] dark:text-zinc-400">
                                Loading chart data...
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Future Appointments Histogram */}
                        <div className="bg-white border border-[var(--border)] dark:bg-zinc-900 dark:border-zinc-800 rounded-3xl p-6 shadow-sm lg:col-span-2 space-y-4 text-[var(--foreground)] dark:text-white">
                          <div>
                            <h4 className="text-sm font-black text-[var(--foreground)] dark:text-white">
                              Upcoming Booking Density (Next 14 Days)
                            </h4>
                            <p className="text-[10px] text-[var(--text-muted)] dark:text-zinc-400">
                              Future slots scheduled date-wise
                            </p>
                          </div>

                          <div className="h-64 flex items-center justify-center p-2">
                            {doctorAnalytics.appointments_future ? (
                              renderHistogram(doctorAnalytics.appointments_future)
                            ) : (
                              <div className="text-xs text-[var(--text-muted)] dark:text-zinc-400">
                                Loading chart data...
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="bg-[var(--card)] border border-[var(--border)] rounded-3xl p-12 text-center text-[var(--text-muted)]">
                      <TrendingUp className="w-12 h-12 mx-auto text-indigo-500 mb-4 opacity-50" />
                      <p className="font-bold text-sm">No Doctor Selected</p>
                      <p className="text-xs mt-1">Please choose a doctor from the dropdown above to view their analytics.</p>
                    </div>
                  )}
                </div>
              )}

              {/* TAB: WHATSAPP LINKING */}
              {activeTab === "whatsapp" && (
                <div className="max-w-xl mx-auto bg-[var(--card)] border border-[var(--border)] rounded-3xl p-6 shadow-sm space-y-6">
                  <WhatsAppPanel setToast={setToast} />

                  {/* Message Templates Section */}
                  <div className="border-t border-[var(--border)] pt-6 mt-6 space-y-4">
                    <h3 className="text-sm font-black text-slate-800 dark:text-slate-200">
                      Message Templates
                    </h3>
                    <p className="text-[11px] text-slate-400">
                      Customize your automated WhatsApp messages. Use the chips
                      as placeholders.
                    </p>

                    {(
                      [
                        "bill_notification",
                        "overdue_reminder",
                        "prescription_notification",
                        "appointment_reminder",
                        "appointment_confirmation",
                      ] as const
                    ).map((key) => {
                      const isEditing = editingTemplate === key;
                      const tmpl = waTemplates[key];
                      const label =
                        key === "bill_notification"
                          ? "Bill Notification Template"
                          : key === "overdue_reminder"
                            ? "Overdue Reminder Template"
                            : key === "prescription_notification"
                              ? "Prescription Notification Template"
                              : key === "appointment_reminder"
                                ? "Appointment Reminder Template"
                                : "Appointment Confirmation Template";
                      const chips =
                        key === "bill_notification"
                          ? [
                              "{patient_name}",
                              "{total_amount}",
                              "{remaining_amount}",
                              "{clinic_name}",
                              "{items_list}",
                              "{bill_link}",
                              "{payment_details}",
                              "{description}",
                            ]
                          : key === "overdue_reminder"
                            ? [
                                "{patient_name}",
                                "{remaining_amount}",
                                "{clinic_name}",
                                "{bill_link}",
                                "{description}",
                              ]
                            : key === "prescription_notification"
                              ? [
                                  "{patient_name}",
                                  "{doctor_name}",
                                  "{clinic_name}",
                                  "{diagnosis}",
                                  "{notes}",
                                ]
                              : [
                                  "{patient_name}",
                                  "{doctor_name}",
                                  "{clinic_name}",
                                  "{appointment_time}",
                                  "{reason}",
                                ];

                      return (
                        <div
                          key={key}
                          className="border border-[var(--border)] rounded-2xl p-4 bg-[var(--nav-bg)] space-y-3"
                        >
                          <div className="flex justify-between items-center">
                            <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300">
                              {label}
                            </h4>
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
                            {chips.map((chip) => (
                              <span
                                key={chip}
                                onClick={() => {
                                  if (isEditing) {
                                    setWaTemplates((prev) => ({
                                      ...prev,
                                      [key]: {
                                        ...prev[key],
                                        body: prev[key].body + chip,
                                      },
                                    }));
                                  }
                                }}
                                className={`text-[9px] font-mono px-2 py-0.5 rounded-md ${
                                  isEditing
                                    ? "bg-indigo-500/10 text-indigo-500 hover:bg-indigo-500/20 cursor-pointer"
                                    : "bg-slate-500/10 text-slate-400"
                                }`}
                              >
                                {chip}
                              </span>
                            ))}
                          </div>

                          {isEditing ? (
                            <div className="space-y-3 pt-2">
                              <div>
                                <label className="text-[9px] font-bold uppercase text-slate-400 block mb-1">
                                  Greeting
                                </label>
                                <input
                                  type="text"
                                  value={tmpl.greeting}
                                  onChange={(e) =>
                                    setWaTemplates((prev) => ({
                                      ...prev,
                                      [key]: {
                                        ...prev[key],
                                        greeting: e.target.value,
                                      },
                                    }))
                                  }
                                  className="w-full px-3 py-1.5 border border-[var(--border)] rounded-xl bg-[var(--input-bg)] text-xs focus:ring-1 focus:ring-indigo-500 outline-none"
                                />
                              </div>
                              <div>
                                <label className="text-[9px] font-bold uppercase text-slate-400 block mb-1">
                                  Body Text
                                </label>
                                <textarea
                                  value={tmpl.body}
                                  rows={4}
                                  onChange={(e) =>
                                    setWaTemplates((prev) => ({
                                      ...prev,
                                      [key]: {
                                        ...prev[key],
                                        body: e.target.value,
                                      },
                                    }))
                                  }
                                  className="w-full px-3 py-1.5 border border-[var(--border)] rounded-xl bg-[var(--input-bg)] text-xs focus:ring-1 focus:ring-indigo-500 outline-none resize-none"
                                />
                              </div>
                              <div>
                                <label className="text-[9px] font-bold uppercase text-slate-400 block mb-1">
                                  Footer
                                </label>
                                <input
                                  type="text"
                                  value={tmpl.footer}
                                  onChange={(e) =>
                                    setWaTemplates((prev) => ({
                                      ...prev,
                                      [key]: {
                                        ...prev[key],
                                        footer: e.target.value,
                                      },
                                    }))
                                  }
                                  className="w-full px-3 py-1.5 border border-[var(--border)] rounded-xl bg-[var(--input-bg)] text-xs focus:ring-1 focus:ring-indigo-500 outline-none"
                                />
                              </div>

                              <div className="flex justify-end space-x-2 pt-1">
                                <button
                                  onClick={() =>
                                    loadWhatsAppTemplates().then(() =>
                                      setEditingTemplate(null),
                                    )
                                  }
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
                              <span className="font-bold text-slate-400 block text-[9px] uppercase tracking-wider mb-1">
                                Preview
                              </span>
                              {tmpl.greeting
                                ? tmpl.greeting
                                : "Dear {patient_name},"}
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

              {/* TAB: SLOT SETTINGS */}
              {activeTab === "availability" && (
                <div className="space-y-6">
                  <div className="flex justify-between items-center">
                    <div>
                      <h2 className="text-xl font-black">
                        Availability & Slot Settings
                      </h2>
                      <p className="text-xs text-slate-400">
                        Configure weekly operational hours and generate discrete
                        appointment slots.
                      </p>
                    </div>
                  </div>

                  {doctorInfo?.role === "HOSPITAL_ADMIN" && (
                    <div className="bg-[var(--card)] border border-[var(--border)] rounded-3xl p-5 shadow-sm space-y-2 border-white">
                      <label className="text-[12px] font-bold uppercase text-slate-400">
                        Select Doctor to Configure
                      </label>
                      <select
                        value={configDoctorId}
                        onChange={(e) => {
                          setConfigDoctorId(e.target.value);
                          loadDoctorAvailability(e.target.value);
                          setSlotPreviews([]);
                        }}
                        className="w-full sm:w-72 mt-1 px-4 py-2 border border-[var(--border)] rounded-2xl bg-[var(--input-bg)] text-xs focus:ring-2 focus:ring-indigo-500 outline-none"
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

                  {(configDoctorId || doctorInfo?.role === "DOCTOR") && (
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                      {/* Weekly Schedule Planner */}
                      <div className="lg:col-span-2 bg-[var(--card)] border border-[var(--border)] rounded-3xl p-6 shadow-sm space-y-4">
                        <h3 className="text-sm font-black">
                          Weekly Availability Template
                        </h3>
                        <div className="space-y-3">
                          {configWeeklyAvail.map((day, idx) => {
                            const daysName = [
                              "Sunday",
                              "Monday",
                              "Tuesday",
                              "Wednesday",
                              "Thursday",
                              "Friday",
                              "Saturday",
                            ];
                            return (
                              <div
                                key={idx}
                                className="flex flex-col sm:flex-row sm:items-center justify-between p-3 border border-[var(--border)] rounded-2xl bg-[var(--nav-bg)] gap-2"
                              >
                                <div className="flex items-center space-x-3 w-32">
                                  <input
                                    type="checkbox"
                                    checked={day.is_active}
                                    onChange={(e) => {
                                      const updated = [...configWeeklyAvail];
                                      updated[idx].is_active = e.target.checked;
                                      setConfigWeeklyAvail(updated);
                                    }}
                                    className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500"
                                  />
                                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                                    {daysName[idx]}
                                  </span>
                                </div>

                                {day.is_active ? (
                                  <div className="flex flex-1 flex-wrap items-center gap-3 text-xs justify-start sm:justify-end">
                                    <div className="flex items-center space-x-1">
                                      <span className="text-slate-400">
                                        Start:
                                      </span>
                                      <input
                                        type="time"
                                        value={day.start_time}
                                        onChange={(e) => {
                                          const updated = [
                                            ...configWeeklyAvail,
                                          ];
                                          updated[idx].start_time =
                                            e.target.value;
                                          setConfigWeeklyAvail(updated);
                                        }}
                                        className="px-2.5 py-1 border border-[var(--border)] rounded-xl bg-[var(--input-bg)] focus:ring-1 focus:ring-indigo-500 outline-none animate-fade-in"
                                      />
                                    </div>
                                    <div className="flex items-center space-x-1">
                                      <span className="text-slate-400">
                                        End:
                                      </span>
                                      <input
                                        type="time"
                                        value={day.end_time}
                                        onChange={(e) => {
                                          const updated = [
                                            ...configWeeklyAvail,
                                          ];
                                          updated[idx].end_time =
                                            e.target.value;
                                          setConfigWeeklyAvail(updated);
                                        }}
                                        className="px-2.5 py-1 border border-[var(--border)] rounded-xl bg-[var(--input-bg)] focus:ring-1 focus:ring-indigo-500 outline-none animate-fade-in"
                                      />
                                    </div>
                                    <div className="flex items-center space-x-1">
                                      <span className="text-slate-400">
                                        Max Qty:
                                      </span>
                                      <input
                                        type="number"
                                        min={1}
                                        value={day.max_patients_per_slot}
                                        onChange={(e) => {
                                          const updated = [
                                            ...configWeeklyAvail,
                                          ];
                                          updated[idx].max_patients_per_slot =
                                            parseInt(e.target.value) || 1;
                                          setConfigWeeklyAvail(updated);
                                        }}
                                        className="w-12 px-2.5 py-1 border border-[var(--border)] rounded-xl bg-[var(--input-bg)] text-center focus:ring-1 focus:ring-indigo-500 outline-none animate-fade-in"
                                      />
                                    </div>
                                  </div>
                                ) : (
                                  <span className="text-[11px] text-slate-400 italic">
                                    Closed / Unavailable
                                  </span>
                                )}
                              </div>
                            );
                          })}
                        </div>

                        <button
                          onClick={async () => {
                            setIsSubmitting(true);
                            try {
                              const activeDays = configWeeklyAvail.filter(
                                (d) => d.is_active,
                              );
                              await fetchAPI("/api/doctors/availability", {
                                method: "POST",
                                body: JSON.stringify({
                                  doctor_id: configDoctorId
                                    ? parseInt(configDoctorId)
                                    : 0,
                                  availabilities: activeDays,
                                }),
                              });
                              setToast({
                                message: "Weekly availability template saved!",
                                type: "success",
                              });
                            } catch (err: any) {
                              setToast({
                                message:
                                  err.message || "Failed to save availability",
                                type: "error",
                              });
                            } finally {
                              setIsSubmitting(false);
                            }
                          }}
                          disabled={isSubmitting}
                          className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-bold text-xs shadow-md transition cursor-pointer"
                        >
                          Save Availability Template
                        </button>
                      </div>

                      {/* Discrete Slots Generator */}
                      <div className="bg-[var(--card)] border border-[var(--border)] rounded-3xl p-6 shadow-sm space-y-4 h-fit">
                        <h3 className="text-sm font-black">
                          Generate Discrete Slots
                        </h3>
                        <p className="text-[11px] text-slate-400 leading-relaxed">
                          Roll out slots in bulk for a date range based on your
                          weekly template. Overlapping slots are automatically
                          skipped.
                        </p>

                        <div className="space-y-3 text-xs">
                          <div>
                            <label className="text-[10px] font-bold uppercase text-slate-400">
                              Start Date
                            </label>
                            <input
                              type="date"
                              value={generateStartDate}
                              onChange={(e) =>
                                setGenerateStartDate(e.target.value)
                              }
                              className="w-full mt-1 px-4 py-2 border border-[var(--border)] rounded-2xl bg-[var(--input-bg)] text-xs focus:ring-2 focus:ring-indigo-500 outline-none"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] font-bold uppercase text-slate-400">
                              End Date
                            </label>
                            <input
                              type="date"
                              value={generateEndDate}
                              onChange={(e) =>
                                setGenerateEndDate(e.target.value)
                              }
                              className="w-full mt-1 px-4 py-2 border border-[var(--border)] rounded-2xl bg-[var(--input-bg)] text-xs focus:ring-2 focus:ring-indigo-500 outline-none"
                            />
                          </div>

                          <button
                            type="button"
                            onClick={async () => {
                              if (!generateStartDate || !generateEndDate) {
                                setToast({
                                  message: "Select start and end dates",
                                  type: "error",
                                });
                                return;
                              }
                              setIsSubmitting(true);
                              try {
                                const data = await fetchAPI(
                                  "/api/slots/generate",
                                  {
                                    method: "POST",
                                    body: JSON.stringify({
                                      doctor_id: configDoctorId
                                        ? parseInt(configDoctorId)
                                        : 0,
                                      start_date: generateStartDate,
                                      end_date: generateEndDate,
                                    }),
                                  },
                                );
                                setSlotPreviews(data || []);
                                if (!data || data.length === 0) {
                                  setToast({
                                    message:
                                      "No slots to generate on these dates",
                                    type: "error",
                                  });
                                }
                              } catch (err: any) {
                                setToast({
                                  message:
                                    err.message ||
                                    "Failed to generate previews",
                                  type: "error",
                                });
                              } finally {
                                setIsSubmitting(false);
                              }
                            }}
                            className="w-full py-2.5 border border-indigo-500/20 text-indigo-500 hover:bg-indigo-500/10 rounded-2xl font-bold transition cursor-pointer text-center"
                          >
                            Preview Slots List
                          </button>
                        </div>

                        {slotPreviews.length > 0 && (
                          <div className="space-y-3 pt-3 border-t border-[var(--border)] animate-fade-in">
                            <span className="text-[10px] font-black uppercase text-slate-400 block">
                              Preview Generated ({slotPreviews.length} slots)
                            </span>
                            <div className="max-h-40 overflow-y-auto space-y-1.5 border border-[var(--border)] rounded-2xl p-2 bg-[var(--nav-bg)] text-[10px]">
                              {slotPreviews.map((p, idx) => (
                                <div
                                  key={idx}
                                  className="flex justify-between text-slate-500"
                                >
                                  <span className="font-bold">
                                    {p.slot_date}
                                  </span>
                                  <span>
                                    {p.start_time} - {p.end_time}
                                  </span>
                                </div>
                              ))}
                            </div>

                            <button
                              onClick={async () => {
                                setIsSubmitting(true);
                                try {
                                  await fetchAPI("/api/slots/confirm", {
                                    method: "POST",
                                    body: JSON.stringify({
                                      doctor_id: configDoctorId
                                        ? parseInt(configDoctorId)
                                        : 0,
                                      slots: slotPreviews,
                                    }),
                                  });
                                  setToast({
                                    message:
                                      "Discrete slots generated successfully!",
                                    type: "success",
                                  });
                                  setSlotPreviews([]);
                                } catch (err: any) {
                                  setToast({
                                    message:
                                      err.message || "Failed to confirm slots",
                                    type: "error",
                                  });
                                } finally {
                                  setIsSubmitting(false);
                                }
                              }}
                              className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-bold shadow-md transition cursor-pointer text-center"
                            >
                              Generate & Save Slots
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* TAB: RESCHEDULE QUEUE */}
              {activeTab === "reschedule-queue" && (
                <div className="space-y-6 animate-fade-in">
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Mark Unavailability form */}
                    <div className="bg-[var(--card)] border border-[var(--border)] rounded-3xl p-6 shadow-sm space-y-4 h-fit lg:col-span-1">
                      <h3 className="text-sm font-black">
                        Register Unavailability
                      </h3>
                      <p className="text-[11px] text-slate-400 leading-relaxed">
                        Marking a doctor unavailable cancels all slots and
                        automatically moves bookings into the reschedule queue.
                        WhatsApp notifications are dispatched instantly.
                      </p>
                      <form
                        onSubmit={async (e) => {
                          e.preventDefault();
                          if (!unavailDoctorId || !unavailDate) return;
                          setIsSubmitting(true);
                          try {
                            await fetchAPI("/api/doctors/unavailable", {
                              method: "POST",
                              body: JSON.stringify({
                                doctor_id: parseInt(unavailDoctorId),
                                unavailable_date: unavailDate,
                                reason: unavailReason,
                              }),
                            });
                            setToast({
                              message:
                                "Doctor registered unavailable. Alerts queued!",
                              type: "success",
                            });
                            setUnavailDoctorId("");
                            setUnavailDate("");
                            setUnavailReason("");
                            loadRescheduleQueue();
                          } catch (err: any) {
                            setToast({
                              message: err.message || "Operation failed",
                              type: "error",
                            });
                          } finally {
                            setIsSubmitting(false);
                          }
                        }}
                        className="space-y-3 text-xs text-[var(--foreground)]"
                      >
                        <div>
                          <label className="text-[10px] font-bold uppercase text-slate-400">
                            Select Doctor
                          </label>
                          <select
                            required
                            value={unavailDoctorId}
                            onChange={(e) => setUnavailDoctorId(e.target.value)}
                            className="w-full mt-1 px-4 py-2 border border-[var(--border)] rounded-2xl bg-[var(--input-bg)] text-xs focus:ring-2 focus:ring-indigo-500 outline-none"
                          >
                            <option value="">-- Choose Doctor --</option>
                            {facilityDoctors.map((doc) => (
                              <option key={doc.id} value={doc.id}>
                                Dr. {doc.name}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="text-[10px] font-bold uppercase text-slate-400">
                            Unavailable Date
                          </label>
                          <input
                            type="date"
                            required
                            value={unavailDate}
                            onChange={(e) => setUnavailDate(e.target.value)}
                            className="w-full mt-1 px-4 py-2 border border-[var(--border)] rounded-2xl bg-[var(--input-bg)] text-xs focus:ring-2 focus:ring-indigo-500 outline-none"
                          />
                        </div>

                        <div>
                          <label className="text-[10px] font-bold uppercase text-slate-400">
                            Reason / Notes
                          </label>
                          <input
                            type="text"
                            required
                            placeholder="e.g. Conference, Medical Leave"
                            value={unavailReason}
                            onChange={(e) => setUnavailReason(e.target.value)}
                            className="w-full mt-1 px-4 py-2 border border-[var(--border)] rounded-2xl bg-[var(--input-bg)] text-xs focus:ring-2 focus:ring-indigo-500 outline-none"
                          />
                        </div>

                        <button
                          type="submit"
                          disabled={isSubmitting}
                          className="w-full py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-2xl font-bold shadow-md transition cursor-pointer text-center"
                        >
                          {isSubmitting ? "Processing..." : "Mark Unavailable"}
                        </button>
                      </form>
                    </div>

                    {/* Reschedule List Table */}
                    <div className="bg-[var(--card)] border border-[var(--border)] rounded-3xl p-6 shadow-sm space-y-4 lg:col-span-2">
                      <h3 className="text-sm font-black">
                        Rescheduling Active Queue
                      </h3>
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs border-collapse">
                          <thead>
                            <tr className="border-b border-[var(--border)] bg-[var(--nav-bg)] text-slate-500 font-bold uppercase">
                              <th className="px-4 py-3">Patient</th>
                              <th className="px-4 py-3">Doctor Name</th>
                              <th className="px-4 py-3">Original Date</th>
                              <th className="px-4 py-3 text-right">Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {rescheduleQueue.length > 0 ? (
                              rescheduleQueue.map((item) => (
                                <tr
                                  key={item.id}
                                  className="border-b border-[var(--border)] hover:bg-table-row-hover transition"
                                >
                                  <td className="px-4 py-3">
                                    <div className="font-bold">
                                      {item.patient_name}
                                    </div>
                                    <div className="text-[9px] text-slate-400">
                                      {item.patient_phone}
                                    </div>
                                  </td>
                                  <td className="px-4 py-3 font-semibold text-slate-600 dark:text-slate-400">
                                    Dr. {item.doctor_name}
                                  </td>
                                  <td className="px-4 py-3 text-slate-500">
                                    {item.original_date}{" "}
                                    {item.original_slot_time
                                      ? `(${item.original_slot_time})`
                                      : ""}
                                  </td>
                                  <td className="px-4 py-3 text-right">
                                    <button
                                      onClick={() => {
                                        setActiveRescheduleItem(item);
                                        setReschedDate("");
                                        setReschedNewSlotId("");
                                        setReschedSlots([]);
                                        setIsRescheduleModalOpen(true);
                                      }}
                                      className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-bold rounded-xl shadow-sm transition cursor-pointer"
                                    >
                                      Assign Slot
                                    </button>
                                  </td>
                                </tr>
                              ))
                            ) : (
                              <tr>
                                <td
                                  colSpan={4}
                                  className="px-4 py-8 text-center text-slate-400 italic"
                                >
                                  No appointments currently need rescheduling.
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>

                  {/* RESCHEDULING ASSIGN MODAL */}
                  <FloatingPanelRoot
                    isOpen={isRescheduleModalOpen}
                    onOpenChange={setIsRescheduleModalOpen}
                  >
                    <FloatingPanelContent className="w-80 sm:w-96 text-left">
                      <FloatingPanelBody>
                        {activeRescheduleItem && (
                          <form
                            onSubmit={async (e) => {
                              e.preventDefault();
                              if (!reschedNewSlotId) return;
                              setIsSubmitting(true);
                              try {
                                await fetchAPI("/api/reschedule-queue", {
                                  method: "PUT",
                                  body: JSON.stringify({
                                    reschedule_id: activeRescheduleItem.id,
                                    new_slot_id: parseInt(reschedNewSlotId),
                                  }),
                                });
                                setToast({
                                  message: "Patient rescheduled successfully!",
                                  type: "success",
                                });
                                setIsRescheduleModalOpen(false);
                                loadRescheduleQueue();
                                loadAppointments();
                              } catch (err: any) {
                                setToast({
                                  message: err.message || "Rescheduling failed",
                                  type: "error",
                                });
                              } finally {
                                setIsSubmitting(false);
                              }
                            }}
                            className="space-y-4 text-xs text-[var(--foreground)] animate-fade-in"
                          >
                            <div>
                              <h3 className="text-sm font-black">
                                Reschedule Appointment
                              </h3>
                              <p className="text-[10px] text-slate-400 mt-0.5">
                                Patient: {activeRescheduleItem.patient_name} |
                                Doctor: Dr. {activeRescheduleItem.doctor_name}
                              </p>
                            </div>

                            <div>
                              <label className="text-[10px] font-bold uppercase text-slate-400">
                                Select Date
                              </label>
                              <input
                                type="date"
                                required
                                value={reschedDate}
                                onChange={(e) => {
                                  setReschedDate(e.target.value);
                                  setReschedNewSlotId("");
                                  fetchRescheduleSlots(
                                    activeRescheduleItem.doctor_id,
                                    e.target.value,
                                  );
                                }}
                                className="w-full mt-1 px-4 py-2 border border-[var(--border)] rounded-2xl bg-[var(--input-bg)] text-xs focus:ring-2 focus:ring-indigo-500 outline-none"
                              />
                            </div>

                            {reschedDate && (
                              <div className="space-y-1">
                                <label className="text-[10px] font-bold uppercase text-slate-400">
                                  Select Available Slot
                                </label>
                                {reschedSlots.length > 0 ? (
                                  <div className="grid grid-cols-2 gap-2 mt-1 max-h-40 overflow-y-auto p-1">
                                    {reschedSlots.map((slot) => {
                                      const isSelected =
                                        reschedNewSlotId === slot.id.toString();
                                      const isFull =
                                        slot.booked_count >=
                                          slot.max_patients ||
                                        slot.status !== "available";
                                      return (
                                        <button
                                          key={slot.id}
                                          type="button"
                                          disabled={isFull && !isSelected}
                                          onClick={() =>
                                            setReschedNewSlotId(
                                              slot.id.toString(),
                                            )
                                          }
                                          className={cn(
                                            "px-3 py-2 border rounded-xl text-center text-xs font-bold transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed",
                                            isSelected
                                              ? "bg-indigo-600 border-indigo-600 text-white"
                                              : "bg-[var(--input-bg)] border-[var(--border)] text-[var(--foreground)] hover:bg-[var(--card-hover)]",
                                          )}
                                        >
                                          <span className="block">
                                            {slot.start_time.substring(0, 5)} -{" "}
                                            {slot.end_time.substring(0, 5)}
                                          </span>
                                          <span className="block text-[8px] opacity-60">
                                            {isFull
                                              ? "Full"
                                              : `${slot.booked_count}/${slot.max_patients} Booked`}
                                          </span>
                                        </button>
                                      );
                                    })}
                                  </div>
                                ) : (
                                  <p className="text-[10px] text-red-500 italic mt-1">
                                    No slots available for this date.
                                  </p>
                                )}
                              </div>
                            )}

                            <div className="flex space-x-2 pt-2 text-xs">
                              <FloatingPanelCloseButton className="w-1/2 py-2.5 rounded-2xl border border-[var(--border)] font-bold text-slate-500 hover:bg-[var(--card-hover)] transition cursor-pointer justify-center" />
                              <FloatingPanelSubmitButton
                                label="Confirm Reschedule"
                                className="w-1/2 py-2.5 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold shadow-md transition cursor-pointer ml-0 h-auto justify-center"
                              />
                            </div>
                          </form>
                        )}
                      </FloatingPanelBody>
                    </FloatingPanelContent>
                  </FloatingPanelRoot>
                </div>
              )}
            </TabTransition>
          </div>
        ) : viewState.type === "patient" ? (
          /* VIEW: PATIENT DETAILS */
          <div className="space-y-6 animate-fade-in">
            <div className="flex justify-between items-center">
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

              <button
                onClick={() => {
                  if (currentPatientData) {
                    setViewState({
                      type: "patient_vitals",
                      patientId: currentPatientData.patient.id,
                    });
                    loadVitals(currentPatientData.patient.id);
                  }
                }}
                className="flex items-center space-x-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-2xl text-xs shadow-md transition cursor-pointer border-none"
              >
                <Activity className="w-4 h-4" />
                <span>Vitals</span>
              </button>
            </div>

            {currentPatientData ? (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Profile Card */}
                <div className="bg-[var(--card)] border border-[var(--border)] rounded-3xl p-6 shadow-sm space-y-5 lg:col-span-1">
                  <div>
                    <h2 className="text-2xl font-black">
                      {currentPatientData.patient.name}
                    </h2>
                    <p className="text-xs text-slate-400 font-bold uppercase mt-1">
                      Patient ID: #PAT-{currentPatientData.patient.id}
                    </p>
                  </div>

                  <div className="space-y-3.5 border-t border-[var(--border)] pt-4 text-xs">
                    <div>
                      <span className="text-slate-400 font-semibold block">
                        Phone Contact
                      </span>
                      <span className="font-bold">
                        {currentPatientData.patient.phone}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 font-semibold block">
                        Gender / Age
                      </span>
                      <span className="font-bold">
                        {currentPatientData.patient.gender} (
                        {currentPatientData.patient.age} yrs)
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 font-semibold block">
                        Medical Records Summary
                      </span>
                      <span className="font-medium text-slate-500 dark:text-slate-400 block whitespace-pre-wrap mt-1">
                        {currentPatientData.patient.medical_history ||
                          "No logs on file."}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 font-semibold block">
                        Outstanding Ledger Balance
                      </span>
                      <span className="font-black text-red-500 text-lg block mt-0.5">
                        ₹
                        {currentPatientData.patient.total_dues.toLocaleString(
                          "en-IN",
                        )}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Booking History & Bills */}
                <div className="lg:col-span-2 space-y-6">
                  {/* Appointments grid */}
                  <div className="bg-[var(--card)] border border-[var(--border)] rounded-3xl p-6 shadow-sm space-y-4">
                    <h3 className="text-sm font-black">
                      Agenda Log (Appointments)
                    </h3>
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
                              <tr
                                key={ap.id}
                                className="border-b border-[var(--border)]"
                              >
                                <td className="px-4 py-3 font-semibold">
                                  {new Date(
                                    ap.appointment_date,
                                  ).toLocaleString()}
                                </td>
                                <td className="px-4 py-3 text-slate-500 dark:text-slate-400">
                                  {ap.reason}
                                </td>
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
                              <td
                                colSpan={3}
                                className="px-4 py-6 text-center text-slate-400 font-semibold"
                              >
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
                                className="border-b border-[var(--border)] hover:bg-table-row-hover transition cursor-pointer"
                                onClick={() => {
                                  setActiveTab("patients");
                                  setViewState({
                                    type: "bill",
                                    billId: bill.id,
                                  });
                                }}
                              >
                                <td className="px-4 py-3 font-bold">
                                  #INV-{bill.id}
                                </td>
                                <td className="px-4 py-3 text-slate-400 max-w-xs truncate">
                                  {bill.description}
                                </td>
                                <td className="px-4 py-3 font-semibold">
                                  ₹{bill.total_amount.toFixed(2)}
                                </td>
                                <td className="px-4 py-3 font-bold text-red-500">
                                  ₹{bill.remaining_amount.toFixed(2)}
                                </td>
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
                              <td
                                colSpan={6}
                                className="px-4 py-6 text-center text-slate-400 font-semibold"
                              >
                                No billing records on file.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Prescriptions Log */}
                  <div className="bg-[var(--card)] border border-[var(--border)] rounded-3xl p-6 shadow-sm space-y-4">
                    <h3 className="text-sm font-black">Prescription History</h3>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="border-b border-[var(--border)] bg-[var(--nav-bg)] text-slate-500 dark:text-slate-400 font-bold uppercase">
                            <th className="px-4 py-3">Rx ID</th>
                            <th className="px-4 py-3">Diagnosis</th>
                            <th className="px-4 py-3 font-semibold">Date</th>
                            <th className="px-4 py-3 text-right">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {currentPatientData.prescriptions &&
                          currentPatientData.prescriptions.length > 0 ? (
                            currentPatientData.prescriptions.map((rx) => (
                              <React.Fragment key={rx.id}>
                                <tr
                                  onClick={() =>
                                    setExpandedRxId(
                                      expandedRxId === rx.id ? null : rx.id,
                                    )
                                  }
                                  className="border-b border-[var(--border)] cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40 transition"
                                >
                                  <td className="px-4 py-3 font-bold text-indigo-500">
                                    <div className="flex items-center space-x-1">
                                      <span>#Rx-{rx.id}</span>
                                      <span className="text-[10px] text-slate-400">
                                        {expandedRxId === rx.id ? "▲" : "▼"}
                                      </span>
                                    </div>
                                  </td>
                                  <td className="px-4 py-3 text-slate-500 dark:text-slate-400">
                                    <div className="font-medium text-slate-700 dark:text-slate-200">
                                      {rx.diagnosis || "N/A"}
                                    </div>
                                    {rx.lab_requests &&
                                      rx.lab_requests.length > 0 && (
                                        <div className="flex flex-wrap gap-1 mt-1.5">
                                          {rx.lab_requests.map(
                                            (test: string, idx: number) => (
                                              <span
                                                key={idx}
                                                className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[9px] font-bold bg-indigo-500/10 text-indigo-600 dark:bg-indigo-400/10 dark:text-indigo-400 border border-indigo-500/20"
                                              >
                                                🔬 {test}
                                              </span>
                                            ),
                                          )}
                                        </div>
                                      )}
                                  </td>
                                  <td className="px-4 py-3 text-slate-400">
                                    {new Date(rx.created_at).toLocaleString()}
                                  </td>
                                  <td className="px-4 py-3 text-right">
                                    <span
                                      className={`inline-block px-2 py-0.5 rounded-full text-[9px] font-bold uppercase ${
                                        rx.status === "dispensed"
                                          ? "bg-emerald-500/10 text-emerald-500"
                                          : rx.status === "partially_dispensed"
                                            ? "bg-blue-500/10 text-blue-500"
                                            : rx.status === "cancelled"
                                              ? "bg-red-500/10 text-red-500"
                                              : "bg-amber-500/10 text-amber-500"
                                      }`}
                                    >
                                      {rx.status}
                                    </span>
                                  </td>
                                </tr>
                                {expandedRxId === rx.id && (
                                  <tr className="bg-slate-50/50 dark:bg-slate-900/30">
                                    <td
                                      colSpan={4}
                                      className="px-6 py-4 border-b border-[var(--border)]"
                                    >
                                      <div className="space-y-3.5 text-xs text-slate-600 dark:text-slate-300">
                                        {/* Consultation Charges */}
                                        <div className="flex justify-between items-center bg-indigo-500/5 border border-indigo-500/10 p-3 rounded-2xl">
                                          <div>
                                            <span className="font-bold text-slate-700 dark:text-slate-200 uppercase text-[10px] tracking-wider block">
                                              Consultation Fee / Visit Charges:
                                            </span>
                                            <span className="text-xs text-slate-500">
                                              Specified by Doctor on
                                              prescription creation
                                            </span>
                                          </div>
                                          <div className="text-right font-mono">
                                            <span className="text-sm font-black text-indigo-500">
                                              ₹
                                              {rx.consultation_charges?.toFixed(
                                                2,
                                              ) || "0.00"}
                                            </span>
                                            {rx.amount_paid > 0 && (
                                              <span className="block text-[10px] text-emerald-500 font-bold mt-0.5">
                                                Paid: ₹
                                                {rx.amount_paid.toFixed(2)}
                                              </span>
                                            )}
                                          </div>
                                        </div>
                                        {/* Notes Section */}
                                        {rx.notes && (
                                          <div>
                                            <span className="font-bold text-slate-700 dark:text-slate-200 uppercase text-[10px] tracking-wider block mb-1">
                                              Clinical Notes / Advice:
                                            </span>
                                            <p className="pl-2.5 border-l-2 border-slate-300 dark:border-slate-700 italic">
                                              {rx.notes}
                                            </p>
                                          </div>
                                        )}
                                        {/* Medicines Section */}
                                        {rx.items && rx.items.length > 0 ? (
                                          <div>
                                            <span className="font-bold text-slate-700 dark:text-slate-200 uppercase text-[10px] tracking-wider block mb-1.5">
                                              Prescribed Medicines:
                                            </span>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pl-2.5">
                                              {rx.items.map(
                                                (
                                                  item: any,
                                                  itemIdx: number,
                                                ) => (
                                                  <div
                                                    key={itemIdx}
                                                    className="bg-white dark:bg-slate-800/50 p-3 rounded-2xl border border-slate-200/60 dark:border-slate-700/60 shadow-sm relative space-y-1"
                                                  >
                                                    <div className="font-bold text-slate-800 dark:text-slate-100 flex justify-between">
                                                      <span>
                                                        {item.medicine_name}
                                                      </span>
                                                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 font-bold uppercase font-mono">
                                                        Qty:{" "}
                                                        {item.quantity || 1}
                                                      </span>
                                                    </div>
                                                    <div className="text-[11px] text-slate-500 dark:text-slate-400">
                                                      Dosage:{" "}
                                                      <span className="font-semibold text-slate-700 dark:text-slate-300">
                                                        {item.dosage || "N/A"}
                                                      </span>{" "}
                                                      | Freq:{" "}
                                                      <span className="font-semibold text-slate-700 dark:text-slate-300">
                                                        {item.frequency ||
                                                          "N/A"}
                                                      </span>{" "}
                                                      | Dur:{" "}
                                                      <span className="font-semibold text-slate-700 dark:text-slate-300">
                                                        {item.duration || "N/A"}
                                                      </span>
                                                    </div>
                                                    {item.instructions && (
                                                      <div className="text-[10px] text-indigo-500 dark:text-indigo-400 italic">
                                                        ★ Instructions:{" "}
                                                        {item.instructions}
                                                      </div>
                                                    )}
                                                  </div>
                                                ),
                                              )}
                                            </div>
                                          </div>
                                        ) : (
                                          <div className="text-slate-400 italic">
                                            No medicines prescribed.
                                          </div>
                                        )}
                                        {/* Lab Tests Section */}
                                        {rx.lab_requests &&
                                          rx.lab_requests.length > 0 && (
                                            <div>
                                              <span className="font-bold text-slate-700 dark:text-slate-200 uppercase text-[10px] tracking-wider block mb-1">
                                                Recommended Diagnostic / Lab
                                                Tests:
                                              </span>
                                              <div className="flex flex-wrap gap-1.5 pl-2.5">
                                                {rx.lab_requests.map(
                                                  (
                                                    test: string,
                                                    testIdx: number,
                                                  ) => (
                                                    <span
                                                      key={testIdx}
                                                      className="inline-flex items-center px-2 py-1 rounded-lg text-xs font-semibold bg-indigo-500/10 text-indigo-600 dark:bg-indigo-400/10 dark:text-indigo-400 border border-indigo-500/20 shadow-sm"
                                                    >
                                                      🔬 {test}
                                                    </span>
                                                  ),
                                                )}
                                              </div>
                                            </div>
                                          )}
                                      </div>
                                    </td>
                                  </tr>
                                )}
                              </React.Fragment>
                            ))
                          ) : (
                            <tr>
                              <td
                                colSpan={4}
                                className="px-4 py-6 text-center text-slate-400 font-semibold"
                              >
                                No prescriptions on record.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Diagnostics & Lab Reports Log */}
                  <div className="bg-[var(--card)] border border-[var(--border)] rounded-3xl p-6 shadow-sm space-y-4">
                    <h3 className="text-sm font-black">Diagnostics & Lab Reports</h3>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="border-b border-[var(--border)] bg-[var(--nav-bg)] text-slate-500 dark:text-slate-400 font-bold uppercase">
                            <th className="px-4 py-3">Ordered Date</th>
                            <th className="px-4 py-3">Test Name</th>
                            <th className="px-4 py-3">Status</th>
                            <th className="px-4 py-3">Findings / Summary</th>
                            <th className="px-4 py-3 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {labRequests && labRequests.length > 0 ? (
                            labRequests.map((lr) => (
                              <tr
                                key={lr.id}
                                className="border-b border-[var(--border)] hover:bg-table-row-hover transition"
                              >
                                <td className="px-4 py-3 font-semibold text-slate-500">
                                  {new Date(lr.requested_date).toLocaleDateString()}
                                </td>
                                <td className="px-4 py-3 font-bold text-slate-700 dark:text-slate-200">
                                  {lr.test_name}
                                </td>
                                <td className="px-4 py-3">
                                  <span
                                    className={cn(
                                      "inline-flex px-2 py-0.5 rounded-full text-[9px] font-bold uppercase",
                                      lr.status === "COMPLETED"
                                        ? "bg-emerald-500/10 text-emerald-500"
                                        : "bg-indigo-500/10 text-indigo-500",
                                    )}
                                  >
                                    {lr.status}
                                  </span>
                                </td>
                                <td className="px-4 py-3 text-slate-400 max-w-xs truncate">
                                  {lr.result_summary || "-"}
                                </td>
                                <td className="px-4 py-3 text-right">
                                  {lr.status === "REQUESTED" &&
                                    doctorInfo?.role !== "USER" && (
                                      <button
                                        onClick={() => {
                                          setUploadLabRequestId(lr.id);
                                          setIsUploadLabOpen(true);
                                        }}
                                        className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-bold rounded-xl shadow-md transition cursor-pointer border-none"
                                      >
                                        Update Result
                                      </button>
                                    )}
                                  {lr.status === "COMPLETED" &&
                                    lr.report_url && (
                                      <a
                                        href={lr.report_url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-block px-3 py-1 bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 text-[10px] font-bold rounded-xl transition animate-fade-in"
                                      >
                                        View Report
                                      </a>
                                    )}
                                </td>
                              </tr>
                            ))
                          ) : (
                            <tr>
                              <td
                                colSpan={5}
                                className="px-4 py-6 text-center text-slate-400 font-semibold"
                              >
                                No diagnostics ordered.
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
              <div className="text-xs text-slate-400 animate-pulse">
                Loading profile data...
              </div>
            )}
          </div>
        ) : viewState.type === "bill" ? (
          /* VIEW: BILL DETAILS */
          <div className="space-y-6 animate-fade-in">
            <button
              onClick={() => {
                if (currentPatientData) {
                  setViewState({
                    type: "patient",
                    patientId: currentPatientData.patient.id,
                  });
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
                    <h2 className="text-xl font-black">
                      Invoice #INV-{currentBillData.bill.id}
                    </h2>
                    <p className="text-[9px] text-slate-400 uppercase tracking-widest mt-1">
                      Clinic: {currentBillData.bill.clinic_name}
                    </p>
                  </div>

                  <div className="space-y-4 border-t border-[var(--border)] pt-4 text-xs">
                    <div>
                      <span className="text-slate-400 block">
                        Total Invoiced
                      </span>
                      <span className="text-xl font-black">
                        ₹
                        {currentBillData.bill.total_amount.toLocaleString(
                          "en-IN",
                        )}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block">
                        Remaining Balance Due
                      </span>
                      <span className="text-xl font-black text-red-500">
                        ₹
                        {currentBillData.bill.remaining_amount.toLocaleString(
                          "en-IN",
                        )}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block">
                        Billing Status
                      </span>
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
                      <FloatingPanelRoot
                        isOpen={isLogPaymentOpen}
                        onOpenChange={setIsLogPaymentOpen}
                      >
                        <FloatingPanelTrigger
                          title="Record Payment installment"
                          className="w-full py-2.5 border border-indigo-600/30 text-indigo-500 hover:bg-indigo-500/10 font-bold rounded-2xl text-xs transition cursor-pointer justify-center"
                        >
                          Record Installment Payment
                        </FloatingPanelTrigger>
                        <FloatingPanelContent className="w-80 sm:w-96 text-left">
                          <FloatingPanelBody>
                            <form
                              onSubmit={handleLogPayment}
                              className="space-y-4 text-xs text-[var(--foreground)]"
                            >
                              <div>
                                <label className="text-[10px] font-bold uppercase text-slate-400">
                                  Amount Paid (INR)
                                </label>
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
                                <label className="text-[10px] font-bold uppercase text-slate-400">
                                  Payment Mode
                                </label>
                                <select
                                  value={payMode}
                                  onChange={(e) =>
                                    setPayMode(e.target.value as any)
                                  }
                                  className="w-full mt-1 px-4 py-2 border border-[var(--border)] rounded-2xl bg-[var(--input-bg)] text-xs focus:ring-2 focus:ring-indigo-500 outline-none"
                                >
                                  <option>CASH</option>
                                  <option>ONLINE_UPI</option>
                                  <option>BANK_TRANSFER</option>
                                </select>
                              </div>

                              <div>
                                <label className="text-[10px] font-bold uppercase text-slate-400">
                                  Remarks
                                </label>
                                <input
                                  type="text"
                                  placeholder="Installment remarks"
                                  value={payRemarks}
                                  onChange={(e) =>
                                    setPayRemarks(e.target.value)
                                  }
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
                    <h3 className="text-sm font-black">
                      Prescribed Medicines & Consultation Lines
                    </h3>
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
                            <tr
                              key={item.id}
                              className="border-b border-[var(--border)]"
                            >
                              <td className="px-4 py-3 font-bold">
                                {item.item_name}
                              </td>
                              <td className="px-4 py-3 font-semibold text-slate-500 dark:text-slate-400">
                                {item.quantity}
                              </td>
                              <td className="px-4 py-3 text-slate-500 dark:text-slate-400">
                                ₹{item.unit_price.toFixed(2)}
                              </td>
                              <td className="px-4 py-3 text-slate-400">
                                {item.dosage || "As advised"}
                              </td>
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
                    <h3 className="text-sm font-black">
                      Payment Installment Timeline
                    </h3>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="border-b border-[var(--border)] bg-[var(--nav-bg)] text-slate-500 dark:text-slate-400 font-bold uppercase">
                            <th className="px-4 py-3">Payment ID</th>
                            <th className="px-4 py-3">Date</th>
                            <th className="px-4 py-3">Mode</th>
                            <th className="px-4 py-3">Notes / Remarks</th>
                            <th className="px-4 py-3 text-right">
                              Amount Paid
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {currentBillData.payments.length > 0 ? (
                            currentBillData.payments.map((p) => (
                              <tr
                                key={p.id}
                                className="border-b border-[var(--border)]"
                              >
                                <td className="px-4 py-3 font-bold">
                                  #PAY-{p.id}
                                </td>
                                <td className="px-4 py-3 text-slate-500 dark:text-slate-400">
                                  {new Date(p.payment_date).toLocaleString()}
                                </td>
                                <td className="px-4 py-3">
                                  <span className="px-2.5 py-0.5 rounded-full bg-indigo-500/10 text-indigo-500 text-[10px] font-bold">
                                    {p.payment_mode}
                                  </span>
                                </td>
                                <td className="px-4 py-3 text-slate-400">
                                  {p.remarks || "-"}
                                </td>
                                <td className="px-4 py-3 text-right font-black text-emerald-500">
                                  + ₹{p.amount_paid.toFixed(2)}
                                </td>
                              </tr>
                            ))
                          ) : (
                            <tr>
                              <td
                                colSpan={5}
                                className="px-4 py-6 text-center text-slate-400 font-semibold"
                              >
                                No payments logged yet.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Prescription Details (Medicines, Tests, Notes) */}
                  {currentBillData.prescription && (
                    <div className="bg-[var(--card)] border border-[var(--border)] rounded-3xl p-6 shadow-sm space-y-4">
                      <h3 className="text-sm font-black text-indigo-500">
                        Associated Prescription Details
                      </h3>

                      {currentBillData.prescription.diagnosis && (
                        <div className="text-xs space-y-1">
                          <span className="font-bold text-slate-400 block uppercase tracking-wider text-[10px]">
                            Diagnosis
                          </span>
                          <span className="font-semibold text-zinc-950 dark:text-zinc-50">
                            {currentBillData.prescription.diagnosis}
                          </span>
                        </div>
                      )}

                      {currentBillData.prescription.notes && (
                        <div className="text-xs space-y-1">
                          <span className="font-bold text-slate-400 block uppercase tracking-wider text-[10px]">
                            Doctor Notes
                          </span>
                          <span className="text-zinc-950 dark:text-zinc-50 whitespace-pre-wrap">
                            {currentBillData.prescription.notes}
                          </span>
                        </div>
                      )}

                      {currentBillData.prescription.items &&
                        currentBillData.prescription.items.length > 0 && (
                          <div className="space-y-2">
                            <span className="font-bold text-slate-400 block uppercase tracking-wider text-[10px]">
                              Prescribed Medicines
                            </span>
                            <div className="overflow-x-auto border border-[var(--border)] rounded-2xl">
                              <table className="w-full text-left text-xs border-collapse">
                                <thead>
                                  <tr className="border-b border-[var(--border)] bg-[var(--nav-bg)] text-slate-500 dark:text-slate-400 font-bold uppercase text-[10px]">
                                    <th className="px-4 py-2">Medicine Name</th>
                                    <th className="px-4 py-2">Dosage</th>
                                    <th className="px-4 py-2">Frequency</th>
                                    <th className="px-4 py-2">Duration</th>
                                    <th className="px-4 py-2">Qty</th>
                                    <th className="px-4 py-2">Instructions</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {currentBillData.prescription.items.map(
                                    (med, idx) => (
                                      <tr
                                        key={idx}
                                        className="border-b border-[var(--border)] last:border-none"
                                      >
                                        <td className="px-4 py-2 font-bold">
                                          {med.medicine_name}
                                        </td>
                                        <td className="px-4 py-2 text-slate-500 dark:text-slate-400">
                                          {med.dosage || "-"}
                                        </td>
                                        <td className="px-4 py-2 text-slate-500 dark:text-slate-400">
                                          {med.frequency || "-"}
                                        </td>
                                        <td className="px-4 py-2 text-slate-500 dark:text-slate-400">
                                          {med.duration || "-"}
                                        </td>
                                        <td className="px-4 py-2 text-slate-500 dark:text-slate-400">
                                          {med.quantity}
                                        </td>
                                        <td className="px-4 py-2 text-slate-400">
                                          {med.instructions || "-"}
                                        </td>
                                      </tr>
                                    ),
                                  )}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}

                      {currentBillData.prescription.lab_requests &&
                        currentBillData.prescription.lab_requests.length >
                          0 && (
                          <div className="space-y-2">
                            <span className="font-bold text-slate-400 block uppercase tracking-wider text-[10px]">
                              Prescribed Diagnostic Tests
                            </span>
                            <div className="flex flex-wrap gap-2">
                              {currentBillData.prescription.lab_requests.map(
                                (test, idx) => (
                                  <span
                                    key={idx}
                                    className="px-3 py-1 bg-amber-500/10 text-amber-500 font-bold rounded-xl text-xs"
                                  >
                                    {test}
                                  </span>
                                ),
                              )}
                            </div>
                          </div>
                        )}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="text-xs text-slate-400 animate-pulse">
                Loading billing details...
              </div>
            )}
          </div>
        ) : (
          /* VIEW: PATIENT VITALS HISTORY */
          <div className="space-y-6 animate-fade-in">
            <button
              onClick={() => {
                if (viewState.patientId) {
                  setViewState({
                    type: "patient",
                    patientId: viewState.patientId,
                  });
                  loadPatientDetails(viewState.patientId);
                } else {
                  setViewState({ type: "list" });
                }
              }}
              className="flex items-center space-x-1.5 text-xs font-bold text-indigo-500 hover:text-indigo-600 transition cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back to Patient Profile</span>
            </button>

            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-xl font-black">Health Vitals & Trends</h2>
                <p className="text-xs text-slate-400">
                  Track heart rate, blood pressure, weight, temperature, and
                  SpO2 metrics over time.
                </p>
              </div>
            </div>

            {vitalsHistory.length > 0 ? (
              <div className="space-y-6">
                {/* Vitals Charts Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* SVG Trend Chart for Heart Rate */}
                  <div className="bg-[var(--card)] border border-[var(--border)] rounded-3xl p-6 shadow-sm space-y-4">
                    <h3 className="text-sm font-black text-slate-200">
                      Heart Rate (bpm) Trend
                    </h3>
                    <div className="h-64 flex items-center justify-center">
                      {renderLineChart(
                        vitalsHistory.map((v) => ({
                          label: new Date(v.recorded_at).toLocaleDateString(),
                          value: v.pulse || v.heart_rate || 70,
                        })),
                      )}
                    </div>
                  </div>

                  {/* SVG Trend Chart for Weight */}
                  <div className="bg-[var(--card)] border border-[var(--border)] rounded-3xl p-6 shadow-sm space-y-4">
                    <h3 className="text-sm font-black text-slate-200">
                      Weight History (kg)
                    </h3>
                    <div className="h-64 flex items-center justify-center">
                      {renderHistogram(
                        vitalsHistory.map((v) => ({
                          label: new Date(v.recorded_at).toLocaleDateString(),
                          value: v.weight_kg || 0,
                        })),
                      )}
                    </div>
                  </div>
                </div>

                {/* Vitals Log Table */}
                <div className="bg-[var(--card)] border border-[var(--border)] rounded-3xl p-6 shadow-sm space-y-4">
                  <h3 className="text-sm font-black text-slate-200 uppercase tracking-widest">
                    Logs History
                  </h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-[var(--border)] bg-[var(--nav-bg)] text-slate-500 dark:text-slate-400 font-bold uppercase">
                          <th className="px-4 py-3">Recorded At</th>
                          <th className="px-4 py-3">Weight</th>
                          <th className="px-4 py-3">Blood Pressure</th>
                          <th className="px-4 py-3">Pulse / HR</th>
                          <th className="px-4 py-3">SpO2</th>
                          <th className="px-4 py-3">Temp</th>
                          <th className="px-4 py-3">Custom Metrics</th>
                          <th className="px-4 py-3 text-right">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {vitalsHistory.map((v) => {
                          const bpAlert = v.blood_pressure
                            ? checkBPRange(v.blood_pressure)[0]
                            : false;
                          const hrAlert = v.heart_rate
                            ? checkHRRange(v.heart_rate)[0]
                            : false;
                          const pulseAlert = v.pulse
                            ? checkHRRange(v.pulse)[0]
                            : false;
                          const spo2Alert = v.spo2 ? v.spo2 < 95 : false;
                          const tempAlert = v.temperature
                            ? v.temperature > 37.8 || v.temperature < 35.5
                            : false;

                          const hasAlert =
                            bpAlert ||
                            hrAlert ||
                            pulseAlert ||
                            spo2Alert ||
                            tempAlert;
                          return (
                            <tr
                              key={v.id}
                              className="border-b border-[var(--border)] hover:bg-[var(--card-hover)] transition"
                            >
                              <td className="px-4 py-3 text-slate-400 font-medium">
                                {new Date(v.recorded_at).toLocaleString()}
                              </td>
                              <td className="px-4 py-3 font-semibold">
                                {v.weight_kg ? `${v.weight_kg} kg` : "-"}
                              </td>
                              <td className="px-4 py-3">
                                <span
                                  className={cn(
                                    bpAlert && "text-red-500 font-bold",
                                  )}
                                >
                                  {v.blood_pressure || "-"}
                                </span>
                              </td>
                              <td className="px-4 py-3">
                                <span
                                  className={cn(
                                    (hrAlert || pulseAlert) &&
                                      "text-red-500 font-bold",
                                  )}
                                >
                                  {v.pulse
                                    ? `${v.pulse} bpm`
                                    : v.heart_rate
                                      ? `${v.heart_rate} bpm`
                                      : "-"}
                                </span>
                              </td>
                              <td className="px-4 py-3">
                                <span
                                  className={cn(
                                    spo2Alert && "text-red-500 font-bold",
                                  )}
                                >
                                  {v.spo2 ? `${v.spo2}%` : "-"}
                                </span>
                              </td>
                              <td className="px-4 py-3">
                                <span
                                  className={cn(
                                    tempAlert && "text-red-500 font-bold",
                                  )}
                                >
                                  {v.temperature ? `${v.temperature}°C` : "-"}
                                </span>
                              </td>
                              <td className="px-4 py-3">
                                {v.custom_metrics &&
                                Object.keys(v.custom_metrics).length > 0 ? (
                                  <div className="flex flex-wrap gap-1">
                                    {Object.entries(v.custom_metrics).map(
                                      ([key, val]: any) => (
                                        <span
                                          key={key}
                                          className="inline-block px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[10px] text-slate-600 dark:text-slate-300 font-medium"
                                        >
                                          {key}: {val}
                                        </span>
                                      ),
                                    )}
                                  </div>
                                ) : (
                                  "-"
                                )}
                              </td>
                              <td className="px-4 py-3 text-right">
                                <span
                                  className={cn(
                                    "inline-flex px-2 py-0.5 rounded-full text-[9px] font-bold",
                                    hasAlert
                                      ? "bg-red-500/10 text-red-500"
                                      : "bg-emerald-500/10 text-emerald-500",
                                  )}
                                >
                                  {hasAlert
                                    ? "⚠️ Out of Range"
                                    : "✓ Safe Range"}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-xs text-slate-400 py-10 text-center font-bold">
                No vitals logged yet. Vitals can be recorded when writing
                prescriptions.
              </div>
            )}
          </div>
        )}
      </main>

      {/* 4. Mobile Bottom Navigation Bar */}
      {(() => {
        const getMobileTabs = () => {
          const role = doctorInfo?.role || "DOCTOR";
          if (role === "USER") {
            return [
              { id: "appointments", label: "Slots", icon: Calendar },
              { id: "labs", label: "Labs", icon: BriefcaseMedical },
              { id: "billing", label: "Billing", icon: FileText },
              { id: "queue", label: "Queue", icon: Clock },
            ];
          } else if (role === "PHARMACIST") {
            return [
              { id: "billing", label: "Billing & Queue", icon: FileText },
              { id: "medicines", label: "Medicines", icon: Plus },
              { id: "whatsapp", label: "WhatsApp", icon: Smartphone },
            ];
          } else if (role === "HOSPITAL_ADMIN") {
            return [
              { id: "staff", label: "Staff", icon: Users },
              { id: "patients", label: "Patients", icon: Users },
              { id: "appointments", label: "Slots", icon: Calendar },
              { id: "queue", label: "Queue", icon: Clock },
              { id: "more", label: "More", icon: Settings },
            ];
          } else {
            // Default to DOCTOR
            return [
              {
                id: "patients",
                label: isClinicMode ? "Patients" : "Treated",
                icon: Users,
              },
              { id: "prescriptions", label: "Rx", icon: FileText },
              { id: "appointments", label: "Slots", icon: Calendar },
              { id: "queue", label: "Queue", icon: Clock },
              { id: "more", label: "More", icon: Settings },
            ];
          }
        };

        const getMoreTabs = () => {
          const role = doctorInfo?.role || "DOCTOR";
          const primaryIds = getMobileTabs().map((t) => t.id);
          const allTabs = [];
          if (role === "HOSPITAL_ADMIN") {
            allTabs.push(
              { id: "staff", label: "Staff Directory", icon: Users },
              { id: "patients", label: "Patient Directory", icon: Users },
              {
                id: "appointments",
                label: "Appointment Slots",
                icon: Calendar,
              },
              {
                id: "availability",
                label: "Availability Settings",
                icon: Settings,
              },
              { id: "queue", label: "Active Hospital Queue", icon: Clock },
              { id: "billing", label: "Billing & Ledger", icon: FileText },
              { id: "medicines", label: "Pharmacy Stock", icon: Plus },
              { id: "analytics", label: "Facility Analytics", icon: Activity },
              { id: "doctor-analytics", label: "Doctor Analytics", icon: TrendingUp },
              {
                id: "reschedule-queue",
                label: "Reschedule Queue",
                icon: AlertTriangle,
              },
              { id: "whatsapp", label: "WhatsApp Gateway", icon: Smartphone },
            );
          } else if (role === "DOCTOR") {
            allTabs.push(
              {
                id: "patients",
                label: isClinicMode ? "Patient Directory" : "Treated Patients",
                icon: Users,
              },
              { id: "prescriptions", label: "Prescriptions", icon: FileText },
              {
                id: "appointments",
                label: "Appointment Slots",
                icon: Calendar,
              },
              { id: "queue", label: "Patient Queue", icon: Clock },
              { id: "availability", label: "Slot Settings", icon: Settings },
            );
            if (isClinicMode) {
              allTabs.push({
                id: "whatsapp",
                label: "WhatsApp Link",
                icon: Smartphone,
              });
            }
          }
          return allTabs.filter((t) => !primaryIds.includes(t.id));
        };

        const primaryTabs = getMobileTabs();
        const moreTabs = getMoreTabs();

        return (
          <>
            <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 z-40 pb-safe shadow-[0_-4px_12px_rgba(0,0,0,0.05)]">
              <div className="flex justify-around items-center py-2 text-[10px] font-bold">
                {primaryTabs.map((tab) => {
                  const Icon = tab.icon;
                  const isTabActive = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => {
                        if (tab.id === "more") {
                          setIsMobileMenuOpen(true);
                        } else {
                          const prevIndex = primaryTabs.findIndex(
                            (t) => t.id === activeTab,
                          );
                          const newIndex = primaryTabs.findIndex(
                            (t) => t.id === tab.id,
                          );
                          if (
                            prevIndex !== -1 &&
                            newIndex !== -1 &&
                            prevIndex !== newIndex
                          ) {
                            setDirection(newIndex > prevIndex ? 1 : -1);
                          }
                          setActiveTab(tab.id as any);
                          setViewState({ type: "list" });
                          setIsMobileMenuOpen(false);
                        }
                      }}
                      className={cn(
                        "flex flex-col items-center justify-center w-14 py-1 transition cursor-pointer select-none space-y-0.5",
                        isTabActive
                          ? "text-indigo-600 dark:text-indigo-400"
                          : "text-slate-400 dark:text-slate-500 hover:text-slate-600",
                      )}
                    >
                      <Icon className="w-5 h-5" />
                      <span className="truncate w-full text-center">
                        {tab.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Mobile "More" Drawer bottom sheet */}
            {isMobileMenuOpen && (
              <div
                className="md:hidden fixed inset-0 z-50 bg-black/60 backdrop-blur-sm transition-all duration-200"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                <div
                  className="absolute bottom-0 left-0 right-0 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 rounded-t-[32px] p-6 max-h-[80vh] overflow-y-auto shadow-2xl animate-in slide-in-from-bottom duration-300"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="w-12 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full mx-auto mb-6" />
                  <h3 className="text-base font-black mb-4 tracking-tight">
                    More Options
                  </h3>
                  <div className="grid grid-cols-3 gap-3">
                    {moreTabs.map((tab) => {
                      const Icon = tab.icon;
                      const isTabActive = activeTab === tab.id;
                      return (
                        <button
                          key={tab.id}
                          onClick={() => {
                            const allMobileTabs = [...primaryTabs, ...moreTabs];
                            const prevIndex = allMobileTabs.findIndex(
                              (t) => t.id === activeTab,
                            );
                            const newIndex = allMobileTabs.findIndex(
                              (t) => t.id === tab.id,
                            );
                            if (
                              prevIndex !== -1 &&
                              newIndex !== -1 &&
                              prevIndex !== newIndex
                            ) {
                              setDirection(newIndex > prevIndex ? 1 : -1);
                            }
                            setActiveTab(tab.id as any);
                            setViewState({ type: "list" });
                            setIsMobileMenuOpen(false);
                          }}
                          className={cn(
                            "flex flex-col items-center justify-center p-3 rounded-2xl border text-center transition cursor-pointer select-none space-y-1.5",
                            isTabActive
                              ? "bg-indigo-600 border-indigo-600 text-white shadow-md"
                              : "bg-slate-50 dark:bg-slate-800/40 border-slate-100 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800",
                          )}
                        >
                          <Icon className="w-5 h-5" />
                          <span className="text-[9px] font-bold leading-tight">
                            {tab.label}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </>
        );
      })()}
    </div>
  );
}

function RoleSelectionScreen({
  user,
  onCompleted,
}: {
  user: any;
  onCompleted: () => void;
}) {
  const [selectedRole, setSelectedRole] = useState<
    "USER" | "DOCTOR" | "HOSPITAL_ADMIN"
  >("USER");
  const [name, setName] = useState(user.name || "");
  const [phone, setPhone] = useState(user.phone || "");
  const [location, setLocation] = useState("");
  const [specialization, setSpecialization] = useState("");
  const [hospitalName, setHospitalName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      await fetchAPI("/api/auth/role-setup", {
        method: "POST",
        body: JSON.stringify({
          role: selectedRole,
          name,
          phone,
          location: selectedRole !== "USER" ? location : "",
          photo_url: "",
          specialization: selectedRole === "DOCTOR" ? specialization : "",
          hospital_name: selectedRole === "HOSPITAL_ADMIN" ? hospitalName : "",
        }),
      });
      onCompleted();
    } catch (err: any) {
      setError(err.message || "Failed to complete setup.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#090d16] text-white flex flex-col justify-between py-12 px-4 relative overflow-hidden">
      {/* Glow Effects */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full bg-indigo-500/10 blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 rounded-full bg-purple-500/10 blur-3xl pointer-events-none" />

      <div className="max-w-4xl w-full mx-auto space-y-8 my-auto relative z-10">
        <div className="text-center space-y-3">
          <div className="w-14 h-14 rounded-3xl bg-gradient-to-tr from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg mx-auto">
            <Activity className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-3xl sm:text-4xl font-black tracking-tight bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">
            Choose Your Portal Role
          </h1>
          <p className="text-sm text-slate-400 max-w-md mx-auto">
            Welcome to Clinically! Please select your system role to unlock
            custom workflows and tools.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Roles Selection Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              {
                id: "USER",
                title: "User / Patient",
                desc: "Log vitals, check lab reports, view queue positions, and pay bills.",
                icon: Users,
                color: "from-blue-500 to-indigo-500",
              },
              {
                id: "DOCTOR",
                title: "Individual Doctor",
                desc: "Prescribe medicine, log patient metrics, order lab tests, and track queue.",
                icon: BriefcaseMedical,
                color: "from-indigo-500 to-purple-500",
              },
              {
                id: "HOSPITAL_ADMIN",
                title: "Hospital Admin",
                desc: "Invite staff, manage organizational billing, and supervise the queues.",
                icon: Activity,
                color: "from-purple-500 to-pink-500",
              },
            ].map((roleOption) => {
              const Icon = roleOption.icon;
              const isSelected = selectedRole === roleOption.id;
              return (
                <div
                  key={roleOption.id}
                  onClick={() => setSelectedRole(roleOption.id as any)}
                  className={cn(
                    "backdrop-blur-xl rounded-3xl p-6 border text-left cursor-pointer transition-all duration-300 relative group overflow-hidden shadow-xl",
                    isSelected
                      ? "bg-slate-900/90 border-indigo-500 shadow-indigo-500/10 scale-[1.02]"
                      : "bg-slate-900/40 border-slate-800 hover:border-slate-700 hover:bg-slate-900/50",
                  )}
                >
                  <div
                    className={cn(
                      "w-12 h-12 rounded-2xl flex items-center justify-center bg-gradient-to-tr shadow-md mb-4",
                      roleOption.color,
                    )}
                  >
                    <Icon className="w-6 h-6 text-white" />
                  </div>
                  <h3 className="text-lg font-bold text-white mb-2">
                    {roleOption.title}
                  </h3>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    {roleOption.desc}
                  </p>
                  <div
                    className={cn(
                      "absolute top-4 right-4 w-4 h-4 rounded-full border flex items-center justify-center transition-colors duration-200",
                      isSelected
                        ? "border-indigo-500 bg-indigo-500"
                        : "border-slate-700",
                    )}
                  >
                    {isSelected && (
                      <div className="w-1.5 h-1.5 rounded-full bg-white" />
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Profile Setup Form Fields */}
          <div className="backdrop-blur-2xl bg-slate-900/60 border border-slate-800/80 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6 max-w-2xl mx-auto">
            <h2 className="text-lg font-bold border-b border-slate-800 pb-3 text-slate-200">
              Complete{" "}
              {selectedRole === "USER"
                ? "Patient"
                : selectedRole === "DOCTOR"
                  ? "Doctor"
                  : "Hospital Admin"}{" "}
              Profile
            </h2>

            {error && (
              <div className="text-xs text-red-400 bg-red-950/40 border border-red-900/60 p-3.5 rounded-2xl">
                {error}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs text-left">
              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase text-slate-400">
                  Full Name
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-4 py-2.5 border border-slate-800 rounded-xl bg-slate-950 text-xs focus:ring-1 focus:ring-indigo-500 outline-none text-white"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase text-slate-400">
                  Phone Contact
                </label>
                <input
                  type="tel"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full px-4 py-2.5 border border-slate-800 rounded-xl bg-slate-950 text-xs focus:ring-1 focus:ring-indigo-500 outline-none text-white"
                />
              </div>

              {selectedRole === "HOSPITAL_ADMIN" && (
                <>
                  <div className="space-y-1 sm:col-span-2">
                    <label className="text-[10px] font-bold uppercase text-slate-400">
                      Hospital / Facility Name
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. City General Hospital"
                      value={hospitalName}
                      onChange={(e) => setHospitalName(e.target.value)}
                      className="w-full px-4 py-2.5 border border-slate-800 rounded-xl bg-slate-950 text-xs focus:ring-1 focus:ring-indigo-500 outline-none text-white"
                    />
                  </div>
                  <div className="space-y-1 sm:col-span-2">
                    <label className="text-[10px] font-bold uppercase text-slate-400">
                      Facility Address
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Street address, City, Country"
                      value={location}
                      onChange={(e) => setLocation(e.target.value)}
                      className="w-full px-4 py-2.5 border border-slate-800 rounded-xl bg-slate-950 text-xs focus:ring-1 focus:ring-indigo-500 outline-none text-white"
                    />
                  </div>
                </>
              )}

              {selectedRole === "DOCTOR" && (
                <>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase text-slate-400">
                      Specialization
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Cardiology, Pediatrics"
                      value={specialization}
                      onChange={(e) => setSpecialization(e.target.value)}
                      className="w-full px-4 py-2.5 border border-slate-800 rounded-xl bg-slate-950 text-xs focus:ring-1 focus:ring-indigo-500 outline-none text-white"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase text-slate-400">
                      Clinic Room / Location
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Room 302, Block A"
                      value={location}
                      onChange={(e) => setLocation(e.target.value)}
                      className="w-full px-4 py-2.5 border border-slate-800 rounded-xl bg-slate-950 text-xs focus:ring-1 focus:ring-indigo-500 outline-none text-white"
                    />
                  </div>
                </>
              )}
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full max-w-2xl mx-auto py-3 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-purple-600 hover:to-indigo-500 text-white font-bold rounded-xl text-xs shadow-lg transition duration-300 disabled:opacity-50 cursor-pointer flex justify-center items-center"
            >
              {loading ? "Saving Profile..." : "Complete Account Setup"}
            </button>
          </div>
        </form>
      </div>

      <footer className="text-center text-[10px] text-slate-600 mt-6">
        &copy; {new Date().getFullYear()} Clinically. Secure Patient EMR &
        Ledger.
      </footer>
    </div>
  );
}
