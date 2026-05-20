# Hospital Management System (HMS)

A complete, dual-role Hospital Management System (HMS) designed around professional Doctor scheduling dashboards, Patient appointment booking, automated Google Calendar event integration, and a serverless email dispatch service.

This workspace provides **two complete systems**:
1. **Production-Ready Python Django & Serverless Codebase**: A cleanly-separated, robust repository structure matching the submission blueprint (`hms/`, `email-service/`, `requirements.txt`).
2. **Interactive Live Full-Stack Simulator**: A visually beautiful React + Node.js/Express full-stack simulator running inside the AI Studio preview iframe on Port 3000, allowing you to instantly interact with the HMS workflows, simulate edge cases, test email payloads, inspect DB models, and trigger synchronized Google Calendar events in real time.

---

## Technical Architecture

### 1. Unified Repository Layout
```yaml
your-repo/
├── README.md                           # Main report and architectural breakdown
├── requirements.txt                    # Primary python dependencies
├── ai-tool-usage-log/                  # Conversation and tool execution session log
│   └── gemini-session.md               # Interactive agent thread logger
├── hms/                                # Django Application
│   ├── manage.py                       # DJ Entrypoint
│   ├── hms_project/                    # Main django settings module
│   │   ├── settings.py                 # PostgreSQL connection & email url environment configs
│   │   └── urls.py                     # Project root URL routing table
│   └── booking_app/                    # Core Hospital scheduling & booking application
│       ├── models.py                   # Secure role separation, Slot, and Appointment models
│       ├── views.py                    # Race-safe bookings, email triggers, & Google OAuth callback
│       └── templates/                  # Fully crafted HTML dashboard views styled with Tailwind
└── email-service/                      # Python serverless email service
    ├── serverless.yml                  # serverless-offline framework service setup
    └── handler.py                      # Multi-trigger AWS Lambda handler (SIGNUP_WELCOME, BOOKING_CONFIRMATION)
```

---

## Installation & Running Locally

### Prerequisites
- Python 3.9+
- PostgreSQL (installed locally)
- Node.js (for the serverless-offline provider, optional if running on pure python)

### Step 1: Running the Serverless Email Service
1. Navigate into the `email-service` directory:
   ```bash
   cd email-service
   ```
2. Install npm dependencies (for serverless-offline):
   ```bash
   npm install serverless serverless-offline --save-dev
   ```
3. Set your SMTP credentials in your local environment variables:
   ```bash
   export SMTP_USER="your-email@gmail.com"
   export SMTP_PASSWORD="your-app-password"
   export SENDER_EMAIL="your-email@gmail.com"
   ```
4. Start the serverless local offline server:
   ```bash
   npx serverless offline start --port 4000
   ```
   *The serverless service is now hosting the serverless handler on http://localhost:4000/dev/email/send.*

### Step 2: Running the Django HMS Backend
1. Open a new terminal and navigate to the project root, then install python requirements:
   ```bash
   pip install -r requirements.txt
   ```
2. Set up your PostgreSQL database and configure standard environment variables:
   ```bash
   export DB_NAME="hms_db"
   export DB_USER="postgres"
   export DB_PASSWORD="your_postgres_password"
   export EMAIL_SERVICE_URL="http://localhost:4000/dev/email/send"
   ```
3. Run standard migrations:
   ```bash
   cd hms
   python manage.py makemigrations
   python manage.py migrate
   ```
4. Start the Django development server:
   ```bash
   python manage.py runserver 8000
   ```
   *The Django system is now running on http://127.0.0.1:8000.*

---

## 🛡️ Critical Design Decision Report

### 1. The Problem: Managing Slot Booking Race Conditions (Double Bookings)
In a hospital scheduling system, Doctor availability slots are extremely private resources. If Patient A and Patient B simultaneously view Dr. Smith's empty `10:00 - 10:30` booking slot and click "Book Spot" at the exact same millisecond, we run into a classic database concurrency race condition. Without active controls, both query threads would see `is_booked = False`, both would proceed to write a matching `AppointmentBooking` record, and both would receive a confirmation. This "double booking" constitutes a fatal clinical operation failure.

### 2. The Two Approaches Considered

#### **Approach A: Database-Level Row Locking via PostgreSQL `select_for_update()` inside `transaction.atomic()`**
This approach implements row-level database locking inside an isolated SQL transaction.
When the booking request is executed, the backend establishes a transaction. It queries the target `AvailabilitySlot` model using Django's `.select_for_update()` builder:
```python
with transaction.atomic():
    slot = AvailabilitySlot.objects.select_for_update().get(id=slot_id)
    if slot.is_booked:
        raise ValidationError("Already booked.")
    slot.is_booked = True
    slot.save()
    AppointmentBooking.objects.create(patient=patient, slot=slot, ...)
```
In PostgreSQL, this executes `SELECT ... FOR UPDATE`, placing a write-lock on that specific slot row. If a secondary concurrent thread tries to query the same slot row with `select_for_update`, PostgreSQL holds the request in a queue until the first transaction finishes (either on commit or rollback).

#### **Approach B: Enforcing a Unique Index Constraint on `/Appointment(slot_id)/`**
This approach relies on database-level constraints as the safety boundary. The `AppointmentBooking` model declares its reference to `AvailabilitySlot` as a strict `OneToOneField`. Under the hood, this translates to a `UNIQUE CONSTRAINT` on the `slot_id` column of the `booking` table.
In this approach, we execute a standard non-blocking query to inspect if `slot.is_booked` is True. Since both see `False`, both attempt to write an `AppointmentBooking` row. The first write finishes successfully. The second write fires a database-level `IntegrityError` due to the unique constraint violation. The backend catches this exception and alerts the second user.

### 3. Defence of the Chosen Approach: Why Approach A (`select_for_update()`) is Superior

While Approach B appears simpler because it avoids row locks, we chose and defended **Approach A** for three critical architectural and operational reasons:

1. **State Isolation and Consistency Guarding**:
   In Approach B, because no locks are placed on the `AvailabilitySlot` row, secondary fields or associated business validation checks are highly vulnerable to drift. For example, if we need to check if a patient has credit, check if the doctor's status remains active/un-suspended, or pre-validate fields *prior to insert*, those validations will happen against stale database views in concurrent threads. In Approach A, **everything** checked within the `.select_for_update()` context is guaranteed to be isolated and consistent; the row is safely frozen for the duration of the state update.

2. **Database Exception Prevention as standard App Flow**:
   Relying on database-level exceptions (`IntegrityError`) as a standard, high-frequency control mechanism is an anti-pattern. If a second user is shown a validation error, it should come from regular application logic, not a low-level SQL database trace abort. Approach A queues the transactions gracefully. When the second transaction is finally released from the lock, it reads the newly-updated, committed data (`is_booked = True`), handles it with simple, readable `if` conditions, and returns a sanitized, explanatory validation message without terminating or rolling back database connections on crash.

3. **Multi-Step Integration Integrity (Calendar Sync / External APIs)**:
   In complex scheduling flows, creating a booking is coupled with downstream network calls (e.g., triggering the Serverless Email POST request and exchanging Google Calendar API tokens). If we use Approach B, triggering these actions before insertion is dangerously unsafe (as insertion might still fail on unique constraints), and triggering them after requires complicated transaction hooks. With Approach A, the lock ensures that by the time the code reaches downstream blocks, the row is guaranteed to be reserved in the session; if any step fails, rolling back the transaction immediately frees up the slot database state cleanly.

---

## Local Development Dashboard Simulator

The live running preview provides a visual control board to test all these flows locally, interact with doctor schedules, and inspect database state charts cleanly. Ensure to try the "Simulate Race Condition" button on the Patients page to see state locks in action!
