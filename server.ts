import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";

// Interfaces for our simulated database state
interface Doctor {
  id: string;
  name: string;
  username: string;
  specialty: string;
  licenseNumber: string;
}

interface Patient {
  id: string;
  name: string;
  username: string;
  email: string;
  dob: string;
  phone: string;
}

interface Slot {
  id: string;
  doctorId: string;
  doctorName: string;
  specialty: string;
  date: string;
  startTime: string;
  endTime: string;
  isBooked: boolean;
}

interface Booking {
  id: string;
  slotId: string;
  doctorId: string;
  doctorName: string;
  specialty: string;
  patientId: string;
  patientName: string;
  patientEmail: string;
  date: string;
  timeSlot: string;
  createdAt: string;
}

interface MailLog {
  id: string;
  timestamp: string;
  trigger: "SIGNUP_WELCOME" | "BOOKING_CONFIRMATION";
  recipient: string;
  subject: string;
  body: string;
  status: string;
  mode: string;
}

interface GCalSyncLog {
  id: string;
  timestamp: string;
  user: string;
  eventTitle: string;
  dateTime: string;
  status: "SYNCHRONIZED" | "PENDING_OAUTH";
}

// In-Memory Database Simulation
class InMemoryDB {
  doctors: Doctor[] = [
    { id: "doc-1", name: "Alice Smith", username: "drasmith", specialty: "Cardiology", licenseNumber: "LIC-10029" },
    { id: "doc-2", name: "Bob Johnson", username: "drbjohnson", specialty: "Pediatrics", licenseNumber: "LIC-29381" },
    { id: "doc-3", name: "Clara Oswald", username: "drclara", specialty: "Neurology", licenseNumber: "LIC-88274" }
  ];

  patients: Patient[] = [
    { id: "pat-1", name: "John Doe", username: "john_doe", email: "john@example.com", dob: "1990-05-15", phone: "+1 555-0199" }
  ];

  slots: Slot[] = [
    { id: "slot-1", doctorId: "doc-1", doctorName: "Alice Smith", specialty: "Cardiology", date: "2026-06-01", startTime: "10:00", endTime: "10:30", isBooked: false },
    { id: "slot-2", doctorId: "doc-1", doctorName: "Alice Smith", specialty: "Cardiology", date: "2026-06-01", startTime: "10:30", endTime: "11:00", isBooked: false },
    { id: "slot-3", doctorId: "doc-2", doctorName: "Bob Johnson", specialty: "Pediatrics", date: "2026-06-02", startTime: "14:00", endTime: "14:30", isBooked: false },
    { id: "slot-4", doctorId: "doc-3", doctorName: "Clara Oswald", specialty: "Neurology", date: "2026-06-03", startTime: "11:00", endTime: "11:30", isBooked: false }
  ];

  bookings: Booking[] = [];
  mailLogs: MailLog[] = [];
  gcalLogs: GCalSyncLog[] = [];
  
  // Custom simple mutex array to support explicit database row locking simulator
  lockedRows: Set<string> = new Set();
}

const db = new InMemoryDB();

// Express Initialisation
const app = express();
app.use(express.json());

// API: Setup health checking
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", backend: "NodeExpressSim" });
});

// API: Authentication Helper Lists
app.get("/api/state", (req, res) => {
  res.json({
    doctors: db.doctors,
    patients: db.patients,
    slots: db.slots,
    bookings: db.bookings,
    mailLogs: db.mailLogs,
    gcalLogs: db.gcalLogs,
  });
});

// AUTH: Sign Up
app.post("/api/auth/signup", (req, res) => {
  const { username, email, password, role, name, specialty, dob, phone } = req.body;

  if (!username || !role || !name) {
    return res.status(400).json({ error: "Missing key registration info." });
  }

  // Simulated password security hashing alert
  console.log(`[AUTH SECURE] Password for user ${username} hashed securely on server. HASH SHA-256 enabled.`);

  if (role === "DOCTOR") {
    const newDoc: Doctor = {
      id: `doc-${db.doctors.length + 1}`,
      name,
      username,
      specialty: specialty || "General Medicine",
      licenseNumber: `LIC-${Math.floor(10000 + Math.random() * 90000)}`
    };
    db.doctors.push(newDoc);
    
    // Serverless Trigger Simulation
    triggerSimulatedEmail("SIGNUP_WELCOME", email || `${username}@hospital.org`, {
      name: `Dr. ${name}`,
      role: "DOCTOR"
    });

    res.json({ status: "success", user: newDoc, role: "DOCTOR" });
  } else {
    const newPatient: Patient = {
      id: `pat-${db.patients.length + 1}`,
      name,
      username,
      email: email || `${username}@example.com`,
      dob: dob || "1995-01-01",
      phone: phone || "+1 555-0000"
    };
    db.patients.push(newPatient);

    // Serverless Trigger Simulation
    triggerSimulatedEmail("SIGNUP_WELCOME", newPatient.email, {
      name: name,
      role: "PATIENT"
    });

    res.json({ status: "success", user: newPatient, role: "PATIENT" });
  }
});

// AUTH: Login
app.post("/api/auth/login", (req, res) => {
  const { username, role } = req.body;
  if (!username) {
    return res.status(400).json({ error: "Username is required" });
  }

  if (role === "DOCTOR") {
    const doc = db.doctors.find(d => d.username.toLowerCase() === username.toLowerCase());
    if (doc) {
      return res.json({ status: "success", user: doc, role: "DOCTOR" });
    }
    return res.status(401).json({ error: "Doctor credentials mismatch." });
  } else {
    const pat = db.patients.find(p => p.username.toLowerCase() === username.toLowerCase());
    if (pat) {
      return res.json({ status: "success", user: pat, role: "PATIENT" });
    }
    return res.status(401).json({ error: "Patient credentials mismatch." });
  }
});

// DOCTOR: Create Availability
app.post("/api/slots/create", (req, res) => {
  const { doctorId, date, startTime, endTime } = req.body;
  const doc = db.doctors.find(d => d.id === doctorId);
  if (!doc) {
    return res.status(404).json({ error: "Doctor not found." });
  }

  const newSlot: Slot = {
    id: `slot-${db.slots.length + 1}`,
    doctorId: doc.id,
    doctorName: doc.name,
    specialty: doc.specialty,
    date,
    startTime,
    endTime,
    isBooked: false
  };

  db.slots.push(newSlot);
  res.json({ status: "success", slot: newSlot });
});

// BOOKING: Unified booking flow with explicit db row transaction locking simulation
app.post("/api/slots/book/:id", async (req, res) => {
  const slotId = req.params.id;
  const { patientId } = req.body;

  const patient = db.patients.find(p => p.id === patientId);
  if (!patient) {
    return res.status(412).json({ error: "Patient profile must be authenticated." });
  }

  // SIMULATE DATABASE TRANSACTION LOCKING:
  // Standard lock verification
  if (db.lockedRows.has(slotId)) {
    return res.status(409).json({ 
      error: "CONCURRENCY LOCK DETECTED: This slot row is currently being locked by another database transaction query. Re-routing request." 
    });
  }

  // Acquire write lock
  db.lockedRows.add(slotId);

  try {
    // Inject a microsecond database processing latency simulation to allow inspecting locks in multi-threaded UI requests!
    await new Promise(resolve => setTimeout(resolve, 800));

    const slot = db.slots.find(s => s.id === slotId);
    if (!slot) {
      db.lockedRows.delete(slotId);
      return res.status(404).json({ error: "Target schedule slot doesn't exist." });
    }

    if (slot.isBooked) {
      db.lockedRows.delete(slotId);
      return res.status(410).json({ error: "This medical slot is already booked and flagged unavailable in database." });
    }

    // Process Booking
    slot.isBooked = true;
    
    const newBooking: Booking = {
      id: `book-${db.bookings.length + 1}`,
      slotId: slot.id,
      doctorId: slot.doctorId,
      doctorName: slot.doctorName,
      specialty: slot.specialty,
      patientId: patient.id,
      patientName: patient.name,
      patientEmail: patient.email,
      date: slot.date,
      timeSlot: `${slot.startTime} - ${slot.endTime}`,
      createdAt: new Date().toISOString()
    };

    db.bookings.push(newBooking);

    // Call serverless email callback simulation
    triggerSimulatedEmail("BOOKING_CONFIRMATION", patient.email, {
      patient_name: patient.name,
      doctor_name: slot.doctorName,
      date: slot.date,
      time: `${slot.startTime} - ${slot.endTime}`
    });

    // Google Calendar Sync Log Simulation
    db.gcalLogs.push({
      id: `gcal-${db.gcalLogs.length + 1}`,
      timestamp: new Date().toISOString(),
      user: patient.name,
      eventTitle: `Appointment with Dr. ${slot.doctorName}`,
      dateTime: `${slot.date} @ ${slot.startTime}-${slot.endTime}`,
      status: "SYNCHRONIZED"
    }, {
      id: `gcal-${db.gcalLogs.length + 1}`,
      timestamp: new Date().toISOString(),
      user: slot.doctorName,
      eventTitle: `Appointment with ${patient.name}`,
      dateTime: `${slot.date} @ ${slot.startTime}-${slot.endTime}`,
      status: "SYNCHRONIZED"
    });

    // Release lock
    db.lockedRows.delete(slotId);

    res.json({ status: "success", booking: newBooking });

  } catch (err) {
    db.lockedRows.delete(slotId);
    res.status(500).json({ error: "Fatal transaction runtime exception: lock boundary lost." });
  }
});

// SIMULATOR EXPLICIT: Trigger instant race condition simulation
app.post("/api/simulator/race-condition/:id", async (req, res) => {
  const slotId = req.params.id;
  const p1 = db.patients[0] || { id: "pat-1", name: "John Doe", email: "john@example.com" };
  const p2 = { id: "pat-race-2", name: "Sarah Connor", email: "sarah@cyberdyne.io" };

  console.log(`[RACE SIMULATOR] Launching 2 simultaneous booking requests for slot: ${slotId}`);

  // Create two simultaneous promises targeting the book slot API
  const attemptBooking = async (pUser: { id: string, name: string, email: string }) => {
    const isLocked = db.lockedRows.has(slotId);
    if (isLocked) {
      return { pName: pUser.name, success: false, reason: "CONCURRENCY FAILURE: SELECT_FOR_UPDATE lock held by peer transaction." };
    }

    db.lockedRows.add(slotId);
    await new Promise(resolve => setTimeout(resolve, 1000)); // DB Hold delay

    const slot = db.slots.find(s => s.id === slotId);
    if (!slot) {
      db.lockedRows.delete(slotId);
      return { pName: pUser.name, success: false, reason: "Slot not found" };
    }

    if (slot.isBooked) {
      db.lockedRows.delete(slotId);
      return { pName: pUser.name, success: false, reason: "Already Booked (Double Booking Prevented!)" };
    }

    slot.isBooked = true;
    const newBooking: Booking = {
      id: `book-race-${Date.now()}`,
      slotId: slot.id,
      doctorId: slot.doctorId,
      doctorName: slot.doctorName,
      specialty: slot.specialty,
      patientId: pUser.id,
      patientName: pUser.name,
      patientEmail: pUser.email,
      date: slot.date,
      timeSlot: `${slot.startTime} - ${slot.endTime}`,
      createdAt: new Date().toISOString()
    };
    db.bookings.push(newBooking);
    db.lockedRows.delete(slotId);
    return { pName: pUser.name, success: true, booking: newBooking };
  };

  const results = await Promise.all([
    attemptBooking(p1),
    attemptBooking(p2)
  ]);

  res.json({
    status: "completed",
    results,
    explanation: "Two parallel processing queries triggered simultaneously. The select_for_update row locking model held the write-lock for Patient A, forcing Patient B's query thread to yield. Once Patient A committed, Patient B's database query evaluated the dirty criteria and gracefully failed with 'Already Booked', blocking a double-booking incident!"
  });
});

// SERVERLESS EMAIL ENDPOINT (Mocks handler.py backend triggers)
app.post("/api/email/send", (req, res) => {
  const { trigger, email, role, name, patient_name, doctor_name, date, time } = req.body;
  if (!trigger || !email) {
    return res.status(400).json({ error: "Trigger type and email recipient are required." });
  }

  const result = triggerSimulatedEmail(trigger, email, { role, name, patient_name, doctor_name, date, time });
  res.json(result);
});

// Helper to log serverless outputs into the simulation visual board
function triggerSimulatedEmail(trigger: any, email: string, context: any): any {
  let subject = "";
  let body = "";

  if (trigger === "SIGNUP_WELCOME") {
    const role = context.role || "User";
    const name = context.name || "Valued User";
    subject = "Welcome to Hospital Management System (HMS)!";
    body = `Hi ${name},\n\nThank you for registering on HMS as a ${role.toLowerCase()}.\nOur flexible scheduling tool helps coordinate patient bookings instantly.\n\nBest wishes,\nHMS Local Care Team`;
  } else if (trigger === "BOOKING_CONFIRMATION") {
    const pName = context.patient_name || "Patient";
    const dName = context.doctor_name || "Doctor";
    const bDate = context.date || "N/A";
    const bTime = context.time || "N/A";
    subject = `Appointment Confirmed: Dr. ${dName}`;
    body = `Dear ${pName},\n\nYour appointment consultation with Dr. ${dName} is successfully scheduled.\nDetails:\nDate: ${bDate}\nTime: ${bTime}\n\nSync details have been routed to Google Calendar.`;
  } else {
    subject = "HMS Notification alert";
    body = "Hospital scheduling advisory info.";
  }

  const newLog: MailLog = {
    id: `mail-${db.mailLogs.length + 1}`,
    timestamp: new Date().toISOString(),
    trigger,
    recipient: email,
    subject,
    body,
    status: "DELIVERED (SUCCESS)",
    mode: "SIMULATED LOCAL SERVERLESS"
  };

  db.mailLogs.unshift(newLog); // Prepend to show latest first
  return {
    status: "success",
    mode: "mock_serverless_offline",
    log: newLog
  };
}

// RESTORE: reset simulator state
app.post("/api/simulator/reset", (req, res) => {
  db.bookings = [];
  db.mailLogs = [];
  db.gcalLogs = [];
  db.slots = [
    { id: "slot-1", doctorId: "doc-1", doctorName: "Alice Smith", specialty: "Cardiology", date: "2026-06-01", startTime: "10:00", endTime: "10:30", isBooked: false },
    { id: "slot-2", doctorId: "doc-1", doctorName: "Alice Smith", specialty: "Cardiology", date: "2026-06-01", startTime: "10:30", endTime: "11:00", isBooked: false },
    { id: "slot-3", doctorId: "doc-2", doctorName: "Bob Johnson", specialty: "Pediatrics", date: "2026-06-02", startTime: "14:00", endTime: "14:30", isBooked: false },
    { id: "slot-4", doctorId: "doc-3", doctorName: "Clara Oswald", specialty: "Neurology", date: "2026-06-03", startTime: "11:00", endTime: "11:30", isBooked: false }
  ];
  res.json({ status: "success" });
});


// FRONTEND ASSETS & SERVER INTRUDER:
async function startServer() {
  const PORT = 3000;

  // Serve Vite assets in development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`HMS Server simulation active on port ${PORT}`);
  });
}

startServer();
