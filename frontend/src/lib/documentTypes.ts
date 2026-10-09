export const EMPLOYEE_DOCUMENT_TYPES = [
  "Employee Application Form",
  "CV / Resume",
  "Recent Photograph",
  "CNIC / National ID Copy",
  "Passport Copy — if applicable",
  "Educational Certificates",
  "Educational Transcripts / Mark Sheets",
  "Experience Certificates",
  "Previous Employment / Relieving Letter",
  "Reference / Recommendation Letters",
  "Employee Information Form",
  "Employment / Appointment Letter",
  "Job Description",
  "Offer Letter",
  "Employment Contract / Agreement",
  "NDA — Non-Disclosure Agreement",
  "Company Policies Acknowledgment",
  "Code of Conduct Agreement",
  "IT / Computer Usage Policy Acknowledgment",
  "Data Privacy / Confidentiality Agreement",
  "Bank Account / Salary Details",
  "Tax Information / Tax Documents",
  "Emergency Contact Form",
  "Medical / Fitness Certificate — if required",
  "Background Verification Report — if applicable",
  "Police / Character Certificate — if required",
  "Joining / Onboarding Checklist",
  "Employee ID Card Record",
  "Asset Handover Form",
  "Laptop / Computer Handover Form",
  "SIM / Mobile / Other Equipment Handover",
  "Leave Records",
  "Attendance Records",
  "Performance Evaluation Records",
  "Training / Certification Records",
  "Warning / Disciplinary Records — if applicable",
  "Promotion / Salary Revision Letters",
  "Transfer / Department Change Records",
  "Increment Letter",
  "Resignation Letter",
  "Exit Interview Form",
  "Clearance Form",
  "Final Settlement Record",
  "Experience / Service Certificate",
  "Relieving Letter",
  "Company Asset Return Form",
  "Employee File Closing Checklist",
];

export const EMPLOYEE_DOCUMENT_TYPE_OPTIONS = EMPLOYEE_DOCUMENT_TYPES.map((docType) => ({
  value: docType,
  label: docType,
}));

/**
 * Single source of truth for uploadable document file types.
 *
 * These MUST stay in sync with the backend allow-list in
 * backend/src/middleware/uploadDocs.js (isDocumentAllowed). The browser's
 * "accept" attribute is only a filter hint — the server is the real gate — but
 * if the two drift apart users are shown a file dialog that hides files the
 * server would happily accept (or lets them pick files it will reject), which
 * is exactly the "I can't select my .jpg" confusion this list prevents.
 */
export const UPLOADABLE_DOC_EXTENSIONS = [
  ".pdf",
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".gif",
  ".bmp",
  ".doc",
  ".docx",
  ".txt",
] as const;

/** Value for the accept="" attribute of a document file input. */
export const UPLOADABLE_DOC_ACCEPT = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/bmp",
  ".pdf",
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".gif",
  ".bmp",
  ".doc",
  ".docx",
  ".txt",
].join(",");

/** Server-side upload cap (multer `limits.fileSize` in uploadDocs.js). */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/**
 * Human-readable list of what the file picker accepts, built from the allow-list
 * so it can never drift from it. Used for the upload hint under the file input.
 */
export const UPLOADABLE_DOC_LABEL = "PDF, JPEG, PNG, Word or TXT";

/** Why a chosen file was rejected, or null when it is acceptable. */
export function validateUploadableFile(file: File | null | undefined): {
  code: "type" | "size" | "empty";
  message: string;
} | null {
  if (!file) return { code: "empty", message: "No file selected." };

  const ext = `.${(file.name.split(".").pop() ?? "").toLowerCase()}`;
  if (!(UPLOADABLE_DOC_EXTENSIONS as readonly string[]).includes(ext)) {
    return {
      code: "type",
      message: `"${ext || file.name}" files are not supported. Allowed: ${UPLOADABLE_DOC_LABEL}.`,
    };
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    return {
      code: "size",
      message: `That file is ${(file.size / (1024 * 1024)).toFixed(1)}MB. The maximum is 10MB.`,
    };
  }

  if (file.size === 0) {
    return { code: "empty", message: "That file is empty." };
  }

  return null;
}
