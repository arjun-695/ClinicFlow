import { BillDetail } from "../page";

export const buildInvoicePDF = async (
  detail: BillDetail,
  doctorInfo: any,
  facilityDoctors: any[]
): Promise<any> => {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF();
  const { bill, items, payments, prescription } = detail;

  // Helper for number to words
  const numberToWords = (num: number): string => {
    const a = [
      "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
      "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"
    ];
    const b = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

    const roundedNum = Math.round(num * 100) / 100;
    const intPart = Math.floor(roundedNum);
    const decimals = Math.round((roundedNum - intPart) * 100);

    const convertLessThanOneThousand = (n: number): string => {
      let str = "";
      if (n >= 100) {
        str += a[Math.floor(n / 100)] + " Hundred ";
        n %= 100;
      }
      if (n >= 20) {
        str += b[Math.floor(n / 10)] + " ";
        n %= 10;
      }
      if (n > 0) {
        str += a[n] + " ";
      }
      return str.trim();
    };

    const convertToIndianWords = (n: number): string => {
      if (n === 0) return "";
      let str = "";

      // Crores (1,00,00,000)
      const crores = Math.floor(n / 10000000);
      if (crores > 0) {
        str += convertToIndianWords(crores) + " Crore ";
        n %= 10000000;
      }

      // Lakhs (1,00,000)
      const lakhs = Math.floor(n / 100000);
      if (lakhs > 0) {
        str += convertLessThanOneThousand(lakhs) + " Lakh ";
        n %= 100000;
      }

      // Thousands (1,000)
      const thousands = Math.floor(n / 1000);
      if (thousands > 0) {
        str += convertLessThanOneThousand(thousands) + " Thousand ";
        n %= 1000;
      }

      // Hundreds and below
      if (n > 0) {
        str += convertLessThanOneThousand(n);
      }

      return str.trim();
    };

    if (intPart === 0 && decimals === 0) return "Zero Rupees Only";

    let rupeeStr = "";
    if (intPart > 0) {
      rupeeStr = convertToIndianWords(intPart) + " Rupees";
    }

    let paiseStr = "";
    if (decimals > 0) {
      if (rupeeStr !== "") {
        paiseStr = " and ";
      }
      paiseStr += convertLessThanOneThousand(decimals) + " Paise";
    }

    return (rupeeStr + paiseStr + " Only").trim().replace(/\s+/g, " ");
  };

  // Get active facility details
  const activeFacility = doctorInfo?.facilities?.find(
    (f: any) => f.id === doctorInfo.active_facility_id
  );
  const facilityName = activeFacility?.name || bill.clinic_name || doctorInfo?.clinic_name || "ClinicFlow Hospital";
  const facilityAddress = activeFacility?.address || "Personal Clinic Workspace";
  const facilityPhone = activeFacility?.phone || doctorInfo?.phone || "";
  const addressLines = doc.splitTextToSize(facilityAddress, 160);

  const formattedDate = bill.created_at
    ? new Date(bill.created_at).toLocaleString()
    : new Date().toLocaleString();

  let billY = 118;

  // Reusable page adder helper
  const addNewPage = () => {
    doc.addPage();
    // Draw top header box
    doc.setDrawColor(30, 41, 59);
    doc.setLineWidth(0.5);
    doc.roundedRect(15, 15, 180, 36, 2, 2, "S");

    // Hospital Name / Clinic Name (Centered)
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(30, 41, 59);
    doc.text(facilityName, 105, 23, { align: "center" });

    // Address under it (Centered, small font)
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(71, 85, 105);
    let addressY2 = 28;
    addressLines.forEach((line: string) => {
      doc.text(line, 105, addressY2, { align: "center" });
      addressY2 += 3.5;
    });

    // Phone number centered underneath
    if (facilityPhone) {
      doc.text(`Tel: ${facilityPhone}`, 105, addressY2, { align: "center" });
    }

    // Invoice ID & Date at the top of subsequent pages
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(30, 41, 59);
    doc.text("Invoice ID:", 20, 56);
    doc.setFont("helvetica", "normal");
    doc.text(`#INV-${bill.id}`, 45, 56);

    doc.setFont("helvetica", "bold");
    doc.text("Date:", 145, 56);
    doc.setFont("helvetica", "normal");
    doc.text(formattedDate, 158, 56);

    // Draw content box for the current page content
    doc.setDrawColor(30, 41, 59);
    doc.setLineWidth(0.5);
    doc.roundedRect(15, 62, 180, 215, 2, 2, "S");

    billY = 70;
  };

  // --- DRAW PAGE 1 ---
  // Draw top header box
  doc.setDrawColor(30, 41, 59);
  doc.setLineWidth(0.5);
  doc.roundedRect(15, 15, 180, 36, 2, 2, "S");

  // Hospital Name / Clinic Name (Centered)
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(30, 41, 59);
  doc.text(facilityName, 105, 23, { align: "center" });

  // Address under it (Centered, small font)
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);
  let addressY = 28;
  addressLines.forEach((line: string) => {
    doc.text(line, 105, addressY, { align: "center" });
    addressY += 3.5;
  });

  // Phone number centered underneath
  if (facilityPhone) {
    doc.text(`Tel: ${facilityPhone}`, 105, addressY, { align: "center" });
  }

  // Document Title
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(30, 41, 59);
  doc.text("PATIENT INVOICE", 105, 57, { align: "center" });

  // Patient Details Box
  doc.roundedRect(15, 62, 180, 34, 2, 2, "S");

  // Patient Details Columns
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text("PATIENT DETAILS", 20, 68);
  doc.setFont("helvetica", "normal");
  doc.text(bill.patient_name || "N/A", 20, 74);
  
  let ageGen = "";
  if (bill.patient_age) ageGen += `Age: ${bill.patient_age} YRS`;
  if (bill.patient_gender) {
    if (ageGen) ageGen += " | ";
    ageGen += `Gender: ${bill.patient_gender}`;
  }
  doc.text(ageGen || "N/A", 20, 80);
  doc.text(`Phone: ${bill.patient_phone || "N/A"}`, 20, 86);

  // Right Column inside details box
  doc.setFont("helvetica", "bold");
  doc.text("Bill No:", 110, 74);
  doc.setFont("helvetica", "normal");
  doc.text(`#INV-${bill.id}`, 128, 74);

  doc.setFont("helvetica", "bold");
  doc.text("Bill Date/Time:", 110, 80);
  doc.setFont("helvetica", "normal");
  doc.text(formattedDate, 138, 80);

  doc.setFont("helvetica", "bold");
  doc.text("Physician:", 110, 86);
  doc.setFont("helvetica", "normal");
  doc.text(bill.doctor_name || doctorInfo?.name || "Attending Doctor", 130, 86);

  // DETAILS Title
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("DETAILS", 105, 103, { align: "center" });

  // Table Header
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(30, 41, 59);
  doc.text("Service / Item Name", 20, 110);
  doc.text("Qty", 125, 110, { align: "center" });
  doc.text("Unit Price", 155, 110, { align: "right" });
  doc.text("Amount (Rs.)", 190, 110, { align: "right" });
  
  doc.setDrawColor(71, 85, 105);
  doc.setLineWidth(0.5);
  doc.line(15, 112, 195, 112);

  // Table Items list
  doc.setFont("helvetica", "normal");
  if (items && items.length > 0) {
    items.forEach((item: any) => {
      if (billY > 260) {
        doc.line(15, billY, 195, billY);
        addNewPage();

        // Draw Table Header on new page
        doc.setFontSize(9);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(30, 41, 59);
        doc.text("Service / Item Name", 20, billY);
        doc.text("Qty", 125, billY, { align: "center" });
        doc.text("Unit Price", 155, billY, { align: "right" });
        doc.text("Amount (Rs.)", 190, billY, { align: "right" });
        
        doc.setDrawColor(71, 85, 105);
        doc.setLineWidth(0.5);
        doc.line(15, billY + 2, 195, billY + 2);
        billY += 8;
        doc.setFont("helvetica", "normal");
      }
      const nameText = item.dosage ? `${item.item_name} (${item.dosage})` : item.item_name;
      doc.text(nameText, 20, billY);
      doc.text((item.quantity || 0).toString(), 125, billY, { align: "center" });
      doc.text((Number(item.unit_price) || 0).toFixed(2), 155, billY, { align: "right" });
      doc.text(((Number(item.quantity) || 0) * (Number(item.unit_price) || 0)).toFixed(2), 190, billY, { align: "right" });
      billY += 7;
    });
  }

  doc.line(15, billY, 195, billY);
  billY += 6;

  // Totals Box
  if (billY > 230) {
    addNewPage();
  }

  doc.setFont("helvetica", "bold");
  doc.text("Bill Amount:", 140, billY);
  doc.text((Number(bill.total_amount) || 0).toFixed(2), 190, billY, { align: "right" });
  billY += 6;

  const totalPaid = (Number(bill.total_amount) || 0) - (Number(bill.remaining_amount) || 0);
  doc.text("Amount Paid:", 140, billY);
  doc.text((Number(totalPaid) || 0).toFixed(2), 190, billY, { align: "right" });
  billY += 6;

  doc.setTextColor(220, 38, 38);
  doc.text("Outstanding Dues:", 140, billY);
  doc.text((Number(bill.remaining_amount) || 0).toFixed(2), 190, billY, { align: "right" });
  doc.setTextColor(30, 41, 59);
  billY += 8;

  doc.line(15, billY, 195, billY);
  billY += 6;

  // In Words
  doc.setFont("helvetica", "bold");
  doc.text("In Words :", 20, billY);
  doc.setFont("helvetica", "normal");
  const wordsText = numberToWords(Number(bill.total_amount) || 0);
  const wordsLines = doc.splitTextToSize(wordsText, 140);
  let wordY = billY;
  wordsLines.forEach((line: string) => {
    if (wordY > 265) {
      addNewPage();
      wordY = billY;
    }
    doc.text(line, 42, wordY);
    wordY += 4.5;
  });
  billY = wordY + 2;

  // --- PRESCRIPTION SECTION ---
  if (prescription) {
    if (billY > 170) {
      addNewPage();
    } else {
      billY += 6;
      doc.line(15, billY, 195, billY);
      billY += 6;
    }

    const contentX = 22;
    const textValX = 55;

    doc.setFont("helvetica", "bold");
    doc.setTextColor(79, 70, 229);
    doc.setFontSize(11);
    doc.text("Prescription Details:", contentX, billY);
    billY += 6;

    doc.setFontSize(9);
    doc.setTextColor(51, 65, 85);

    if (prescription.diagnosis) {
      doc.setFont("helvetica", "bold");
      doc.text("Diagnosis:", contentX, billY);
      doc.setFont("helvetica", "normal");
      doc.text(prescription.diagnosis, textValX, billY);
      billY += 5;
    }

    if (prescription.notes) {
      if (billY > 260) {
        addNewPage();
      }
      doc.setFont("helvetica", "bold");
      doc.text("Doctor Notes:", contentX, billY);
      doc.setFont("helvetica", "normal");
      const notesLines = doc.splitTextToSize(prescription.notes, 140);
      notesLines.forEach((line: string) => {
        if (billY > 260) {
          addNewPage();
        }
        doc.text(line, textValX, billY);
        billY += 4.5;
      });
    }

    if (prescription.items && prescription.items.length > 0) {
      if (billY > 250) {
        addNewPage();
      }
      doc.setFont("helvetica", "bold");
      doc.setTextColor(79, 70, 229);
      doc.text("Prescribed Medicines:", contentX, billY);
      billY += 5;

      doc.setTextColor(51, 65, 85);
      prescription.items.forEach((med: any) => {
        if (billY > 250) {
          addNewPage();
        }
        doc.setFont("helvetica", "bold");
        doc.text(med.medicine_name, contentX + 2, billY);
        doc.setFont("helvetica", "normal");
        let details = `${med.dosage || "N/A"} | ${med.frequency || "N/A"} | ${med.duration || "N/A"}`;
        if (med.instructions) {
          details += ` (${med.instructions})`;
        }
        doc.text(details, contentX + 2, billY + 4);
        billY += 9;
      });
    }

    if (prescription.lab_requests && prescription.lab_requests.length > 0) {
      if (billY > 250) {
        addNewPage();
      }
      doc.setFont("helvetica", "bold");
      doc.setTextColor(79, 70, 229);
      doc.text("Prescribed Tests:", contentX, billY);
      billY += 5;

      doc.setFont("helvetica", "normal");
      doc.setTextColor(51, 65, 85);
      prescription.lab_requests.forEach((test: string) => {
        if (billY > 260) {
          addNewPage();
        }
        doc.text(`• ${test}`, contentX + 2, billY);
        billY += 4.5;
      });
    }
  }

  return doc;
};

export const generateInvoicePDF = async (
  detail: BillDetail,
  doctorInfo: any,
  facilityDoctors: any[]
) => {
  const doc = await buildInvoicePDF(detail, doctorInfo, facilityDoctors);
  const patientNameSafe = (detail.bill.patient_name || "Patient").replace(/\s+/g, "_");
  doc.save(
    `Invoice_${patientNameSafe}_${detail.bill.id}.pdf`
  );
};
