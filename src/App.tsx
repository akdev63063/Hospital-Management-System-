/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, FormEvent } from "react";
import { 
  Calendar, 
  User, 
  Clock, 
  Lock, 
  Shield, 
  Mail, 
  Plus, 
  LogOut, 
  CheckCircle2, 
  AlertTriangle, 
  Activity, 
  Database, 
  RefreshCw, 
  FileText, 
  Zap, 
  Sparkles, 
  Stethoscope, 
  UserPlus, 
  ChevronRight,
  Terminal,
  Layers,
  Info
} from "lucide-react";

// Types from server simulation
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

interface ConsoleLine {
  source: "django" | "serverless" | "gcal" | "db";
  timestamp: string;
  message: string;
  type: "info" | "success" | "warning" | "error";
}

export default function App() {
  // Global View/Role switcher
  const [activeTab, setActiveTab] = useState<"patient" | "doctor" | "developer">("patient");

  // Simulation State
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [mailLogs, setMailLogs] = useState<MailLog[]>([]);
  const [gcalLogs, setGcalLogs] = useState<GCalSyncLog[]>([]);

  // Simulation Console logs
  const [consoleLogs, setConsoleLogs] = useState<ConsoleLine[]>([
    { source: "django", timestamp: "13:41:32", message: "Django server started on port 8000. Connected to PostgreSQL on localhost:5432.", type: "info" },
    { source: "serverless", timestamp: "13:41:33", message: "Serverless offline daemon started on port 4000. Listening at http://localhost:4000/dev/email/send.", type: "info" },
    { source: "db", timestamp: "13:41:34", message: "Database schemas initialized: 4 tables mapped from ORM.", type: "success" }
  ]);

  // Loaded Profile references
  const [currentDoctor, setCurrentDoctor] = useState<Doctor | null>(null);
  const [currentPatient, setCurrentPatient] = useState<Patient | null>(null);

  // Authenticated State simulator
  const [isDoctorLoggedIn, setIsDoctorLoggedIn] = useState(true);
  const [isPatientLoggedIn, setIsPatientLoggedIn] = useState(true);

  // Form states
  const [newSlotDate, setNewSlotDate] = useState("2026-06-01");
  const [newSlotStart, setNewSlotStart] = useState("09:00");
  const [newSlotEnd, setNewSlotEnd] = useState("09:30");

  const [signupUsername, setSignupUsername] = useState("");
  const [signupName, setSignupName] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupRole, setSignupRole] = useState<"DOCTOR" | "PATIENT">("PATIENT");
  const [signupSpecialty, setSignupSpecialty] = useState("Cardiology");
  
  // Doctor Auth state
  const [doctorLoginUser, setDoctorLoginUser] = useState("");
  const [patientLoginUser, setPatientLoginUser] = useState("");

  // Loading indicator states
  const [isBookingLoading, setIsBookingLoading] = useState<string | null>(null);
  const [isSimulatorRunning, setIsSimulatorRunning] = useState(false);
  const [simulatorOutput, setSimulatorOutput] = useState<any>(null);

  const [doctorsGcalConnected, setDoctorsGcalConnected] = useState<Record<string, boolean>>({
    "doc-1": true,
    "doc-2": false,
  });
  const [patientsGcalConnected, setPatientsGcalConnected] = useState<Record<string, boolean>>({
    "pat-1": true,
  });

  // Fetch full state from server simulation
  const fetchState = async (silently = false) => {
    try {
      const res = await fetch("/api/state");
      if (res.ok) {
        const data = await res.json();
        setDoctors(data.doctors || []);
        setPatients(data.patients || []);
        setSlots(data.slots || []);
        setBookings(data.bookings || []);
        setMailLogs(data.mailLogs || []);
        setGcalLogs(data.gcalLogs || []);

        // Preload default authenticated references if not already locked
        if (!currentDoctor && data.doctors.length > 0) {
          setCurrentDoctor(data.doctors[0]);
        }
        if (!currentPatient && data.patients.length > 0) {
          setCurrentPatient(data.patients[0]);
        }
      }
    } catch (err) {
      console.error("Error connecting with Express simulation:", err);
    }
  };

  useEffect(() => {
    fetchState();
    // Auto refresh states lightly
    const interval = setInterval(() => fetchState(true), 3000);
    return () => clearInterval(interval);
  }, []);

  // Log append helper
  const addLog = (source: ConsoleLine["source"], message: string, type: ConsoleLine["type"] = "info") => {
    const time = new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setConsoleLogs(prev => [
      { source, timestamp: time, message, type },
      ...prev
    ]);
  };

  // Trigger Local Reset
  const handleReset = async () => {
    if (!window.confirm("Restore simulation to default state? This will purge active bookings and logs.")) return;
    try {
      const res = await fetch("/api/simulator/reset", { method: "POST" });
      if (res.ok) {
        addLog("db", "Database truncate completed. Initial doctor availability slots restored.", "warning");
        setSimulatorOutput(null);
        fetchState();
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Sign Up Workflow
  const handleSignup = async (e: FormEvent) => {
    e.preventDefault();
    if (!signupUsername || !signupName || !signupEmail) {
      alert("Please offer comprehensive fields.");
      return;
    }

    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: signupUsername,
          name: signupName,
          email: signupEmail,
          role: signupRole,
          specialty: signupSpecialty,
          dob: "1994-08-12",
          phone: "+44 7700 900077"
        })
      });

      if (res.ok) {
        const data = await res.json();
        addLog("django", `HTTP POST /signup -> User: '${signupUsername}' created as ${signupRole}. Password crypt hash recorded.`, "success");
        addLog("serverless", `Trigger serverless SIGNUP_WELCOME routing to recipient: ${signupEmail}`, "info");
        
        // Reset state
        setSignupUsername("");
        setSignupName("");
        setSignupEmail("");
        fetchState();

        if (signupRole === "DOCTOR") {
          setCurrentDoctor(data.user);
          setIsDoctorLoggedIn(true);
          setActiveTab("doctor");
        } else {
          setCurrentPatient(data.user);
          setIsPatientLoggedIn(true);
          setActiveTab("patient");
        }
        alert(`Account configured successfully under role of ${signupRole}! Welcoming triggers initialized.`);
      } else {
        const data = await res.json();
        alert(data.error || "Signup error");
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Slot Availability creation
  const handleCreateSlot = async (e: FormEvent) => {
    e.preventDefault();
    if (!currentDoctor) {
      alert("No active logged Doctor profile detected.");
      return;
    }

    try {
      const res = await fetch("/api/slots/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          doctorId: currentDoctor.id,
          date: newSlotDate,
          startTime: newSlotStart,
          endTime: newSlotEnd
        })
      });

      if (res.ok) {
        addLog("django", `ORM: INSERT INTO availability_slot (doctor, date, start_time, end_time) VALUES (${currentDoctor.username}, ${newSlotDate}, ${newSlotStart}-${newSlotEnd})`, "success");
        fetchState();
        alert("Clinical schedule listing posted onto Hospital DB system.");
      } else {
        const data = await res.json();
        alert(data.error || "Failed to catalog slot.");
      }
    } catch (err) {
       console.error(err);
    }
  };

  // General Booking Checkout Action
  const handleBookSlot = async (slotId: string) => {
    if (!currentPatient) {
      alert("Please assign or sign up a Patient profile first.");
      return;
    }

    const targetSlot = slots.find(s => s.id === slotId);
    if (!targetSlot) return;

    const confirmed = window.confirm(
      `Confirm appointment scheduling with Dr. ${targetSlot.doctorName} on ${targetSlot.date} at ${targetSlot.startTime}-${targetSlot.endTime}? This will block other patient selections.`
    );
    if (!confirmed) return;

    setIsBookingLoading(slotId);
    try {
      addLog("django", `BEGIN TRANSACTION; acquire SELECT_FOR_UPDATE lock on AvailabilitySlot(id=${slotId})`, "info");
      
      const res = await fetch(`/api/slots/book/${slotId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patientId: currentPatient.id })
      });

      if (res.ok) {
        const data = await res.json();
        addLog("db", `LOCK FREED -> Slot table state marked booked. INSERT INTO appointment successfully committed.`, "success");
        addLog("serverless", `Trigger serverless BOOKING_CONFIRMATION route -> mail generated for: ${currentPatient.email}`, "success");
        
        // GCal Logs simulation
        if (patientsGcalConnected[currentPatient.id]) {
          addLog("gcal", `OAuth2 API: Inserted schedule event on Patient '${currentPatient.name}' calendar.`, "success");
        }
        if (doctorsGcalConnected[targetSlot.doctorId]) {
          addLog("gcal", `OAuth2 API: Inserted schedule event on Doctor '${targetSlot.doctorName}' calendar.`, "success");
        }

        fetchState();
        alert("Appointment locked in clinical ledger and email sent!");
      } else {
        const data = await res.json();
        addLog("db", `LOCK FREED ON EXCEPTION: ${data.error}`, "error");
        alert(data.error || "Clinical scheduling rejected.");
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsBookingLoading(null);
    }
  };

  // Launch parallel concurrency race condition simulation
  const runRaceConditionSimulation = async (slotId: string) => {
    setIsSimulatorRunning(true);
    setSimulatorOutput(null);
    addLog("django", `CONCURRENCY TEST: Dispatching two parallel SQL processes for slot: ${slotId}`, "warning");

    try {
      const res = await fetch(`/api/simulator/race-condition/${slotId}`, { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setSimulatorOutput(data);
        
        addLog("django", "Process A: Found empty slot -> locked row (SELECT_FOR_UPDATE) -> Transaction executing...", "info");
        addLog("django", "Process B: Attempted query -> BLOCKED in PostgreSQL pool queue waiting for lock release...", "warning");
        addLog("django", "Process A: Write committed (Appointment generated -> is_booked=True) -> Release lock.", "success");
        addLog("django", "Process B: Released -> evaluated post-lock row -> is_booked IS TRUE -> Aborted with clean ValidationError!", "error");

        fetchState();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsSimulatorRunning(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 font-sans flex flex-col antialiased">
      {/* Upper Status Line */}
      <div className="bg-slate-950 px-4 py-2 border-b border-slate-800 flex justify-between items-center text-xs text-slate-400">
        <div className="flex items-center space-x-2">
          <span className="h-2 w-2 bg-emerald-500 rounded-full animate-pulse"></span>
          <span><strong>HMS Simulator Environment</strong>: Local Express + Django Template</span>
        </div>
        <div className="flex items-center space-x-4">
          <span>PORT: <strong className="text-slate-200">3000 (Ingress Active)</strong></span>
          <span>SMTP Mode: <strong className="text-blue-400">Serverless Offline Triggered</strong></span>
        </div>
      </div>

      {/* Main Header */}
      <header className="bg-slate-900 border-b border-slate-800 px-6 py-4 sm:px-12 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            <Stethoscope className="text-emerald-500 h-6 w-6" />
            Hospital Management System (HMS)
          </h1>
          <p className="text-xs text-slate-400 mt-1 max-w-xl">
            Surgical schedule coordinates, multi-role dashboard panels, Google Calendar integration, and serverless background event handlers.
          </p>
        </div>

        {/* Action controls */}
        <div className="flex items-center gap-3">
          <button 
            id="reset-btn"
            onClick={handleReset}
            className="bg-slate-800 hover:bg-slate-700 text-slate-300 px-3.5 py-1.5 rounded-md text-xs font-semibold flex items-center gap-2 border border-slate-700 transition"
          >
            <RefreshCw className="h-3 w-3" />
            Reset State
          </button>
          
          <div className="bg-slate-950 p-1 rounded-lg border border-slate-800 flex gap-1">
            <button
              id="tab-patient"
              onClick={() => setActiveTab("patient")}
              className={`px-3 py-1 rounded text-xs font-semibold transition ${activeTab === "patient" ? "bg-cyan-600 text-white shadow" : "text-slate-400 hover:text-slate-200"}`}
            >
              Patient Portal
            </button>
            <button
              id="tab-doctor"
              onClick={() => setActiveTab("doctor")}
              className={`px-3 py-1 rounded text-xs font-semibold transition ${activeTab === "doctor" ? "bg-blue-600 text-white shadow" : "text-slate-400 hover:text-slate-200"}`}
            >
              Doctor Portal
            </button>
            <button
              id="tab-developer"
              onClick={() => setActiveTab("developer")}
              className={`px-3 py-1 rounded text-xs font-semibold transition ${activeTab === "developer" ? "font-mono bg-purple-950 border border-purple-800 text-purple-200" : "text-slate-400 hover:text-slate-200"}`}
            >
              Database & Code
            </button>
          </div>
        </div>
      </header>

      {/* Split Console Grid */}
      <div className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* LEFT / CENTER VIEW PANEL */}
        <div className="lg:col-span-8 flex flex-col space-y-6">
          
          {/* PATIENT PORTAL */}
          {activeTab === "patient" && (
            <div className="space-y-6">
              {/* Profile Config Row */}
              <div id="patient-banner" className="bg-slate-950 p-4 rounded-xl border border-slate-800 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 sm:p-3 bg-cyan-900/40 text-cyan-400 rounded-lg border border-cyan-800/50">
                    <User className="h-5 w-5" />
                  </div>
                  <div>
                    <span className="text-xs text-slate-400 uppercase tracking-wider font-semibold font-mono">Patient Context User</span>
                    <h3 className="text-sm font-bold text-white">
                      {isPatientLoggedIn && currentPatient ? `${currentPatient.name} (@${currentPatient.username})` : "Anonymous Visitor"}
                    </h3>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <select 
                    value={currentPatient?.id || ""} 
                    onChange={(e) => {
                      const selected = patients.find(p => p.id === e.target.value);
                      if (selected) {
                        setCurrentPatient(selected);
                        addLog("django", `Changed Patient login state context to: ${selected.username}`, "info");
                      }
                    }}
                    className="p-1.5 rounded bg-slate-900 text-slate-200 border border-slate-700 text-xs font-medium"
                  >
                    {patients.map(p => (
                      <option key={p.id} value={p.id}>{p.name} (Patient)</option>
                    ))}
                  </select>

                  <button 
                    onClick={() => {
                      const enabled = !patientsGcalConnected[currentPatient?.id || ""];
                      setPatientsGcalConnected(prev => ({ ...prev, [currentPatient?.id || ""]: enabled }));
                      addLog("gcal", enabled ? `Google Calendar connected for patient: ${currentPatient?.username}` : `Google Calendar unlinked for patient: ${currentPatient?.username}`, "info");
                    }}
                    className={`px-2.5 py-1 rounded text-[11px] font-semibold border ${patientsGcalConnected[currentPatient?.id || ""] ? "bg-emerald-950 border-emerald-800 text-emerald-400" : "bg-slate-900 border-slate-700 text-slate-400 hover:text-slate-200"}`}
                  >
                    {patientsGcalConnected[currentPatient?.id || ""] ? "✓ Google Cal Connected" : "Link Google Cal"}
                  </button>
                </div>
              </div>

              {/* Central Scheduling Slots list */}
              <div id="available-slots-container" className="bg-slate-950 rounded-xl border border-slate-800 p-6">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h2 className="text-lg font-bold text-white flex items-center gap-2">
                      <Calendar className="text-cyan-400 h-5 w-5" />
                      Browse Healthcare Availability spots
                    </h2>
                    <p className="text-xs text-slate-400 mt-1">
                      Choose an open time slot from the hospital registry. Race-prevention safeguards ensure atomic locks.
                    </p>
                  </div>
                </div>

                {slots.filter(s => !s.isBooked).length > 0 ? (
                  <div className="divide-y divide-slate-800">
                    {slots.filter(s => !s.isBooked).map(slot => (
                      <div key={slot.id} className="py-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-slate-100">Dr. {slot.doctorName}</span>
                            <span className="bg-slate-800 text-slate-300 text-[10px] px-2 py-0.5 rounded font-medium">
                              {slot.specialty}
                            </span>
                          </div>
                          <div className="flex items-center gap-4 mt-2 text-xs text-slate-400">
                            <span className="flex items-center gap-1 font-mono text-slate-300">
                              <Calendar className="h-3.5 w-3.5 text-slate-500" />
                              {slot.date}
                            </span>
                            <span className="flex items-center gap-1 font-mono text-slate-300">
                              <Clock className="h-3.5 w-3.5 text-slate-500" />
                              {slot.startTime} - {slot.endTime}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            id={`book-slot-${slot.id}`}
                            onClick={() => handleBookSlot(slot.id)}
                            disabled={isBookingLoading !== null}
                            className="bg-cyan-600 hover:bg-cyan-500 text-white px-3.5 py-1.5 rounded text-xs font-semibold shadow transition-colors"
                          >
                            {isBookingLoading === slot.id ? "Securing Lock..." : "Book Appointment"}
                          </button>

                          <button
                            id={`debug-race-${slot.id}`}
                            onClick={() => runRaceConditionSimulation(slot.id)}
                            title="Simulates microsecond parallel checkouts on this specific row code inside a separate database query connection pool"
                            className="bg-purple-950 hover:bg-purple-900 border border-purple-800 text-purple-300 px-3 py-1.5 rounded text-xs font-mono font-semibold hover:text-white transition"
                          >
                            Simulate Race Check
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-8 text-center text-slate-500 text-xs">
                    <Info className="h-8 w-8 text-slate-600 mx-auto mb-2" />
                    No patient booking slots currently listed on database. Set availability under Doctor portal to create items!
                  </div>
                )}
              </div>

              {/* Race Condition Simulator explanation card */}
              {simulatorOutput && (
                <div className="bg-slate-950 p-6 rounded-xl border border-purple-800/40 shadow-xl space-y-4">
                  <div className="flex justify-between items-center border-b border-purple-900 pb-3">
                    <div className="flex items-center gap-2">
                      <Sparkles className="text-purple-400 h-5 w-5" />
                      <h3 className="font-bold text-white text-md">Concurrency Lock Simulation Trace Report</h3>
                    </div>
                    <span className="bg-purple-900/30 text-purple-300 text-[10px] border border-purple-800/50 px-2 py-0.5 rounded font-mono">
                      POSTGRES_SELECT_FOR_UPDATE
                    </span>
                  </div>

                  <p className="text-xs text-slate-300 leading-relaxed font-sans">
                    {simulatorOutput.explanation}
                  </p>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                    {simulatorOutput.results.map((r: any, idx: number) => (
                      <div key={idx} className={`p-3 rounded-lg border ${r.success ? "bg-emerald-950/25 border-emerald-900 text-emerald-300" : "bg-red-950/25 border-red-900 text-red-300"}`}>
                        <div className="flex justify-between items-center">
                          <span className="font-bold text-xs">Connection Thread {idx + 1} ({r.pName})</span>
                          <span className={`text-[9px] px-2 py-0.5 rounded uppercase font-bold tracking-wider font-mono ${r.success ? "bg-emerald-900/40 border border-emerald-700 text-emerald-200" : "bg-red-950 border border-red-800/80 text-red-300"}`}>
                            {r.success ? "COMMIT (Race Secured)" : "ROLLBACK (Race Avoided)"}
                          </span>
                        </div>
                        <div className="text-xs text-slate-300 leading-relaxed mt-2 p-1.5 bg-slate-900/50 rounded font-mono border border-slate-800">
                          {r.success ? `✓ Locked slot row. Created Booking ID: ${r.booking.id}` : `⚠️ ${r.reason}`}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Active Bookings (List of my consultation records) */}
              <div id="confirmed-bookings" className="bg-slate-950 p-6 rounded-xl border border-slate-800">
                <h3 className="text-sm font-bold text-white mb-4">My Booked Hospital Consultations ({bookings.filter(b => b.patientId === currentPatient?.id).length})</h3>
                {bookings.filter(b => b.patientId === currentPatient?.id).length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {bookings.filter(b => b.patientId === currentPatient?.id).map(b => (
                      <div key={b.id} className="p-3 border border-slate-800 bg-slate-900 text-xs rounded-xl flex flex-col justify-between">
                        <div>
                          <div className="flex justify-between items-start">
                            <span className="font-bold text-white">Dr. {b.doctorName}</span>
                            <span className="bg-cyan-900/30 text-cyan-300 text-[9px] border border-cyan-800/50 px-2 py-0.2 rounded uppercase">
                              {b.specialty}
                            </span>
                          </div>
                          <p className="text-slate-400 text-[11px] mt-1 font-mono">Date: {b.date}</p>
                          <p className="text-slate-400 text-[11px] font-mono">Time Slot: {b.timeSlot}</p>
                        </div>
                        <div className="flex justify-between items-center mt-3 pt-3 border-t border-slate-800 text-[10px] text-slate-500">
                          <span>HMS Ticket: {b.id}</span>
                          <span className="flex items-center gap-1 text-emerald-400">
                            <CheckCircle2 className="h-3 w-3" />
                            Confirmed in Ledger
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-500">You haven't scheduled any consultation events. Use the browse cards to allocate appointments.</p>
                )}
              </div>

            </div>
          )}

          {/* DOCTOR PORTAL */}
          {activeTab === "doctor" && (
            <div className="space-y-6">
              {/* Doctor Context Header */}
              <div id="doctor-banner" className="bg-slate-950 p-4 rounded-xl border border-slate-800 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 sm:p-3 bg-blue-900/40 text-blue-400 rounded-lg border border-blue-800/50">
                    <User className="h-5 w-5" />
                  </div>
                  <div>
                    <span className="text-xs text-slate-400 uppercase tracking-wider font-semibold font-mono">Clinical Practitioner Session</span>
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      Dr. {currentDoctor ? `${currentDoctor.name} (@${currentDoctor.username})` : "Anonymous Doctor"}
                      <span className="bg-blue-900/40 border border-blue-800 text-blue-300 text-[10px] px-2 py-0.2 rounded">
                        {currentDoctor?.specialty}
                      </span>
                    </h3>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <select 
                    value={currentDoctor?.id || ""} 
                    onChange={(e) => {
                      const selected = doctors.find(d => d.id === e.target.value);
                      if (selected) {
                        setCurrentDoctor(selected);
                        addLog("django", `Changed active Doctor session context to: Dr. ${selected.name}`, "info");
                      }
                    }}
                    className="p-1.5 rounded bg-slate-900 text-slate-200 border border-slate-700 text-xs font-medium"
                  >
                    {doctors.map(d => (
                      <option key={d.id} value={d.id}>Dr. {d.name} ({d.specialty})</option>
                    ))}
                  </select>

                  <button 
                    onClick={() => {
                      const enabled = !doctorsGcalConnected[currentDoctor?.id || ""];
                      setDoctorsGcalConnected(prev => ({ ...prev, [currentDoctor?.id || ""]: enabled }));
                      addLog("gcal", enabled ? `Google Calendar connected for doctor: ${currentDoctor?.username}` : `Google Calendar unlinked for doctor: ${currentDoctor?.username}`, "info");
                    }}
                    className={`px-2.5 py-1 rounded text-[11px] font-semibold border ${doctorsGcalConnected[currentDoctor?.id || ""] ? "bg-emerald-950 border-emerald-800 text-emerald-400" : "bg-slate-900 border-slate-700 text-slate-400 hover:text-slate-200"}`}
                  >
                    {doctorsGcalConnected[currentDoctor?.id || ""] ? "✓ Google Cal Connected" : "Link Google Cal"}
                  </button>
                </div>
              </div>

              {/* Set Time slot availability Form */}
              <div id="create-slot-form" className="bg-slate-950 p-6 rounded-xl border border-slate-800 space-y-4">
                <h3 className="text-md font-bold text-white flex items-center gap-2">
                  <Plus className="text-blue-400 h-5 w-5" />
                  Set New Consultation Availability Slot
                </h3>
                <form onSubmit={handleCreateSlot} className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                  <div>
                    <label className="block text-[11px] font-mono text-slate-400 mb-1.5 uppercase">Select Date</label>
                    <input 
                      type="date" 
                      value={newSlotDate}
                      onChange={(e) => setNewSlotDate(e.target.value)}
                      required 
                      className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded text-slate-100 text-xs font-medium"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-mono text-slate-400 mb-1.5 uppercase">Start Time</label>
                    <input 
                      type="time" 
                      value={newSlotStart}
                      onChange={(e) => setNewSlotStart(e.target.value)}
                      required 
                      className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded text-slate-100 text-xs font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-mono text-slate-400 mb-1.5 uppercase">End Time</label>
                    <input 
                      type="time" 
                      value={newSlotEnd}
                      onChange={(e) => setNewSlotEnd(e.target.value)}
                      required 
                      className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded text-slate-100 text-xs font-mono"
                    />
                  </div>
                  <button 
                    type="submit" 
                    className="w-full bg-blue-600 hover:bg-blue-500 text-white py-1.5 rounded text-xs font-semibold shadow transition-colors"
                  >
                    Add Slot Position
                  </button>
                </form>
              </div>

              {/* Active list of doctor's own slot allocations */}
              <div id="my-availability-slots" className="bg-slate-950 p-6 rounded-xl border border-slate-800">
                <h3 className="text-sm font-bold text-white mb-4">My Scheduled Time Slots ({slots.filter(s => s.doctorId === currentDoctor?.id).length})</h3>
                {slots.filter(s => s.doctorId === currentDoctor?.id).length > 0 ? (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {slots.filter(s => s.doctorId === currentDoctor?.id).map(slot => (
                      <div key={slot.id} className={`p-3 rounded-lg border text-xs flex flex-col justify-between ${slot.isBooked ? "bg-emerald-950/20 border-emerald-900/60 text-emerald-400" : "bg-slate-900 border-slate-800 text-slate-300"}`}>
                        <span className="font-semibold font-mono">{slot.date}</span>
                        <span className="text-lg font-bold font-mono mt-1 text-white">{slot.startTime} - {slot.endTime}</span>
                        
                        <div className="mt-3 flex justify-between items-center text-[10px]">
                          <span className={`font-semibold ${slot.isBooked ? "text-emerald-400" : "text-slate-500"}`}>
                            {slot.isBooked ? "✓ Allocated / Booked" : "● Open Spot"}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-500">No slots defined on the database for Dr. {currentDoctor?.name}. Fill the form above to post availability.</p>
                )}
              </div>

              {/* Roster of Doctor's confirmed appointments */}
              <div id="doctor-roster" className="bg-slate-950 p-6 rounded-xl border border-slate-800">
                <h3 className="text-sm font-bold text-white mb-4">Confirmed Patient Roster ({bookings.filter(b => b.doctorId === currentDoctor?.id).length})</h3>
                {bookings.filter(b => b.doctorId === currentDoctor?.id).length > 0 ? (
                  <div className="divide-y divide-slate-800">
                    {bookings.filter(b => b.doctorId === currentDoctor?.id).map(b => (
                      <div key={b.id} className="py-3 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                        <div>
                          <span className="font-bold text-slate-100">{b.patientName}</span>
                          <span className="text-slate-400 text-xs font-mono ml-4">Email: {b.patientEmail}</span>
                        </div>
                        <span className="bg-blue-900/40 text-blue-300 border border-blue-800/80 px-2.5 py-0.5 rounded text-xs font-mono font-semibold">
                          {b.date} @ {b.timeSlot}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-500">No active bookings under your profile scheduled in the database.</p>
                )}
              </div>

            </div>
          )}

          {/* CODEBASES & MODELS TAB */}
          {activeTab === "developer" && (
            <div className="space-y-6">
              
              {/* ORM Table Schemas */}
              <div id="django-schemas-model" className="bg-slate-950 p-6 rounded-xl border border-slate-800 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <h3 className="font-bold text-white flex items-center gap-2">
                    <Database className="text-indigo-400 h-5 w-5" />
                    Django ORM model Schemas
                  </h3>
                  <span className="bg-indigo-900/30 text-indigo-300 text-[10px] px-2 py-0.5 border border-indigo-800/50 rounded uppercase font-mono">
                    PostgreSQL Schema
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono">
                  
                  {/* Slot Model Card */}
                  <div className="p-3.5 bg-slate-900 border border-slate-800 rounded-lg space-y-2">
                    <span className="text-blue-400 font-bold">class AvailabilitySlot(models.Model)</span>
                    <ul className="space-y-1 text-[11px] text-slate-300 pt-1.5 border-t border-slate-800">
                      <li>• <span className="text-indigo-300">doctor</span>: ForeignKey(User, on_delete=CASCADE)</li>
                      <li>• <span className="text-indigo-300">date</span>: DateField()</li>
                      <li>• <span className="text-indigo-300">start_time</span>: TimeField()</li>
                      <li>• <span className="text-indigo-300">end_time</span>: TimeField()</li>
                      <li>• <span className="text-indigo-300">is_booked</span>: BooleanField(default=False)</li>
                    </ul>
                  </div>

                  {/* Booking Model Card */}
                  <div className="p-3.5 bg-slate-900 border border-slate-800 rounded-lg space-y-2">
                    <span className="text-blue-400 font-bold">class AppointmentBooking(models.Model)</span>
                    <ul className="space-y-1 text-[11px] text-slate-300 pt-1.5 border-t border-slate-800">
                      <li>• <span className="text-indigo-300">patient</span>: ForeignKey(User)</li>
                      <li>• <span className="text-indigo-300">doctor</span>: ForeignKey(User)</li>
                      <li>• <span className="text-indigo-300">slot</span>: OneToOneField(AvailabilitySlot) <strong className="text-emerald-400 text-[9px]">[UN_RACE]</strong></li>
                      <li>• <span className="text-indigo-300">created_at</span>: DateTimeField(auto_now_add=True)</li>
                    </ul>
                  </div>

                </div>
              </div>

              {/* Google OAuth client logs */}
              <div id="gcal-auth-status" className="bg-slate-950 p-6 rounded-xl border border-slate-800 space-y-4">
                <h3 className="font-bold text-white text-sm flex items-center gap-2">
                  <Layers className="text-emerald-400 h-5 w-5" />
                  Google Calendar OAuth API insertion Logs
                </h3>

                {gcalLogs.length > 0 ? (
                  <div className="space-y-2.5 font-mono text-xs">
                    {gcalLogs.map(log => (
                      <div key={log.id} className="p-3 bg-slate-900 border border-slate-800 rounded-md">
                        <div className="flex justify-between items-center text-[10px] text-slate-400 mb-1.5">
                          <span>ISO: {log.timestamp}</span>
                          <span className="text-emerald-400 font-bold">✓ Google Cal Sync</span>
                        </div>
                        <p className="text-slate-200"><span className="text-slate-500">Resource Summary:</span> <strong>{log.eventTitle}</strong></p>
                        <p className="text-slate-200 mt-1"><span className="text-slate-500">Auth Subject:</span> {log.user} ({log.dateTime})</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-500">No Google OAuth calendar actions initiated. Authenticate user above to trigger synced calendar outputs!</p>
                )}
              </div>

            </div>
          )}

          {/* USER SIGNUP BOX (For Sandbox Experimenting) */}
          <div id="registration-simulator-card" className="bg-slate-950 p-6 rounded-xl border border-slate-800 space-y-4">
            <h3 className="font-bold text-white text-sm flex items-center gap-2">
              <UserPlus className="text-emerald-400 h-4 w-4" />
              Register New Hospital Account (Simulate Auth signup workflow)
            </h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Create a custom Doctor or Patient account. This tests dynamic user profile initialization, password serialization alerts, and serverless welcome trigger functions automatically.
            </p>

            <form onSubmit={handleSignup} className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <input 
                type="text" 
                placeholder="Username (e.g. drsmith)"
                value={signupUsername}
                onChange={(e) => setSignupUsername(e.target.value)}
                required
                className="px-3 py-1.5 bg-slate-900 border border-slate-700 rounded text-xs text-white"
              />
              <input 
                type="text" 
                placeholder="Full Name (e.g. Alice Smith)"
                value={signupName}
                onChange={(e) => setSignupName(e.target.value)}
                required
                className="px-3 py-1.5 bg-slate-900 border border-slate-700 rounded text-xs text-white"
              />
              <input 
                type="email" 
                placeholder="Email Address"
                value={signupEmail}
                onChange={(e) => setSignupEmail(e.target.value)}
                required
                className="px-3 py-1.5 bg-slate-900 border border-slate-700 rounded text-xs text-white"
              />

              <div className="sm:col-span-1">
                <select 
                  value={signupRole} 
                  onChange={(e: any) => setSignupRole(e.target.value)}
                  className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded text-xs text-white bg-slate-900"
                >
                  <option value="PATIENT">Role: Patient</option>
                  <option value="DOCTOR">Role: Doctor</option>
                </select>
              </div>

              {signupRole === "DOCTOR" ? (
                <input 
                  type="text" 
                  placeholder="Specialty (e.g. Cardiology)"
                  value={signupSpecialty}
                  onChange={(e) => setSignupSpecialty(e.target.value)}
                  className="px-3 py-1.5 bg-slate-900 border border-slate-700 rounded text-xs text-white"
                />
              ) : (
                <div className="px-3 py-1.5 bg-slate-800 border border-slate-700 rounded text-xs text-slate-400 flex items-center">
                  Patient phone & DOB preconfigured
                </div>
              )}

              <button 
                type="submit"
                className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-1.5 px-4 rounded text-xs transition"
              >
                Sign up User
              </button>
            </form>
          </div>

        </div>

        {/* RIGHT HAND SIDE DEVELOPER INSTRUMENTS CONSOLE */}
        <div id="dev-instruments-sidebar" className="lg:col-span-4 space-y-6">
          
          {/* SERVERLESS SMTP LOGS */}
          <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3">
            <div className="flex justify-between items-center border-b border-slate-800 pb-2">
              <span className="font-bold text-white text-xs flex items-center gap-1.5">
                <Mail className="text-yellow-400 h-4 w-4" />
                Serverless Email Logger
              </span>
              <span className="bg-yellow-950 text-yellow-400 text-[9px] border border-yellow-800/60 font-mono px-1.5 py-0.2 rounded uppercase">
                Offline API
              </span>
            </div>

            <p className="text-[10px] text-slate-400 leading-relaxed font-sans mt-1">
              Live HTTP callback triggers generated by our backend. Simulates what Python `handler.py` outputs.
            </p>

            <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
              {mailLogs.length > 0 ? (
                mailLogs.map(log => (
                  <div key={log.id} className="p-3 bg-slate-900/85 border border-slate-800 rounded-lg text-[11px] font-mono space-y-1.5">
                    <div className="flex justify-between items-center text-[9px] text-slate-500">
                      <span>Log ID: {log.id}</span>
                      <span className="text-emerald-400 font-bold font-mono">DELIVERED</span>
                    </div>
                    <div className="text-slate-200 font-semibold text-xs text-slate-100">{log.subject}</div>
                    <p className="text-slate-400 text-[10px]"><strong className="text-slate-300">To:</strong> {log.recipient}</p>
                    <p className="text-slate-400 text-[10px]"><strong className="text-slate-300">Trigger:</strong> <span className="text-yellow-400">{log.trigger}</span></p>
                    <div className="p-1.5 bg-slate-950/60 rounded text-[10px] text-slate-300 border border-slate-800 leading-relaxed whitespace-pre-line mt-1">
                      {log.body}
                    </div>
                  </div>
                ))
              ) : (
                <div className="p-4 text-center text-slate-600 text-[11px]">
                  No backend email events triggered yet. Sign up or book slot to trigger events.
                </div>
              )}
            </div>
          </div>

          {/* ACTIVE DJANGO ORM INTEGRATED SYSTEM CONSOLE */}
          <div className="bg-slate-950 rounded-xl border border-slate-800 flex flex-col overflow-hidden">
            <div className="bg-slate-900/60 border-b border-slate-800 p-3.5 flex justify-between items-center">
              <span className="text-xs font-bold text-white flex items-center gap-1.5 font-mono">
                <Terminal className="text-cyan-400 h-4 w-4" />
                Django ORM console outputs
              </span>
              <span className="h-2 w-2 bg-emerald-400 rounded-full animate-pulse" title="System online"></span>
            </div>

            <div className="bg-slate-950 p-3 font-mono text-[10px] space-y-2 max-h-[380px] overflow-y-auto flex flex-col pb-4 h-[300px]">
              {consoleLogs.map((log, idx) => (
                <div key={idx} className="flex gap-2 items-start border-b border-slate-900/40 pb-1.5">
                  <span className="text-slate-500 select-none">[{log.timestamp}]</span>
                  <div className="flex-1">
                    <span className={`font-semibold mr-1.5 uppercase tracking-wide text-[9px] ${
                      log.source === "django" ? "text-cyan-400" :
                      log.source === "serverless" ? "text-yellow-400" :
                      log.source === "gcal" ? "text-emerald-400" : "text-indigo-400"
                    }`}>
                      {log.source}:
                    </span>
                    <span className={
                      log.type === "error" ? "text-red-400 font-medium" :
                      log.type === "success" ? "text-emerald-300 font-medium" :
                      log.type === "warning" ? "text-amber-400" : "text-slate-300"
                    }>
                      {log.message}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>

      </div>

      {/* Footer copyright */}
      <footer className="bg-slate-950 border-t border-slate-800 py-6 px-4 text-center text-xs text-slate-500">
        <div>
          Hospital Management System | Designed around strict atomic row-locking db constraints and Google Workspace API guidelines.
        </div>
      </footer>
    </div>
  );
}
