<<<<<<< HEAD
# University Dental Clinic — Prototype (split build)

This is the original single-file prototype (`dental_clinic_prototype.html`)
split into a conventional `index.html` + `css/` + `js/` layout. The content
is byte-for-byte identical to the original — nothing was rewritten, only
relocated — so behavior is unchanged.

## Structure

```
.
├── index.html
├── css/
│   └── styles.css
└── js/
    ├── constants.js               global constants (dates, categories, option lists)
    ├── data-seed.js                seed() sample dataset + `let S = seed();`
    ├── personas.js                 PERSONAS map, cur()
    ├── lookups.js                  lookups/computations over the data model
    ├── ui-state.js                 the single UI state object
    ├── icons.js                    inline SVG icon paths
    ├── ui-helpers.js               small markup helpers (tbl, tabsBar, field…)
    ├── modal-toast.js              modal + toast primitives
    ├── notifications.js            in-app alerts
    ├── navigation.js               sidebar nav config, go(), setPersona()
    ├── render.js                   core render() page shell
    ├── screens-patient.js          patient dashboard/appointments/booking/records/etc.
    ├── screens-registration.js     self-registration flow
    ├── screens-clinical-shared.js  dentist dashboard + shared patient list
    ├── tooth-chart.js              SVG tooth chart + condition brush
    ├── screens-chart.js            patient chart tabs
    ├── screens-visits.js           visits list + record-a-visit
    ├── screens-rx.js               prescriptions + dispensing
    ├── screens-referrals.js        referral creation/tracking
    ├── screens-staff-dashboard.js  clinic staff dashboard
    ├── screens-appointments.js     appointment approvals/slots
    ├── screens-inventory.js        medicine inventory
    ├── screens-announcements.js    staff announcement management
    ├── screens-reports.js          monthly/referral/medicine/operational reports
    ├── screens-setup.js            accounts & setup admin screens
    └── app.js                      route table + bootstrap render() call
```

## Why plain scripts, not ES modules

The app renders most of its UI as HTML strings containing inline handlers,
e.g. `onclick="openChart('${p.id}')"`. Those handlers resolve against the
**global** scope at click time. `<script type="module">` files do not leak
their top-level declarations onto `window`, so converting straight to
modules would silently break almost every button in the app.

To keep behavior identical, `index.html` loads the files as classic
`<script src>` tags, in dependency order (a file only calls functions/
constants defined in itself or an earlier file). Top-level `function`
and `const`/`let` declarations in a classic script are already global,
so no other changes were needed.

## Suggested follow-up (not done here)

If/when this moves toward a real build:
1. Replace inline `onclick="..."` strings with `addEventListener`/event
   delegation, then the files above can become genuine ES modules with
   explicit `import`/`export` instead of relying on load order.
2. Split `data-seed.js` further once real data comes from an API —
   it's the one file that's clearly throwaway/demo-only.
3. `screens-reports.js` and `screens-patient.js` are the largest files;
   once modularized they're natural candidates to split further by tab.
=======
# 🦷 University Dental Clinic Management System

A multi-campus web application for managing university dental clinics across **Main Campus**, **Satellite Campus A**, and **Satellite Campus B**. Built with Node.js, Express, and persistent SQLite (`node:sqlite`).

---

## 🚀 What File Should I Run to Run the System?

To run the entire system (backend API + persistent SQLite database + frontend web app), run:

```bash
node server.js
```

or using NPM:

```bash
npm start
```

### Quick 3-Step Start:
1. **Install dependencies** (Express):
   ```bash
   npm install
   ```
2. **Start the server**:
   ```bash
   npm start
   ```
   *(or `node server.js`)*
3. **Open in your web browser**:
   ```
   http://localhost:3000
   ```

> **Note**: Do **not** open `dental_clinic_prototype.html` directly in your browser. The system is a full-stack client-server application. Always run `node server.js` and open `http://localhost:3000` to ensure database persistence and live API features.

### Developer Testing Mode

Run the app with automatic backend restarts and frontend browser reloads:

```bash
npm run dev
```

Open the BrowserSync local URL when it reports it is ready (default **http://localhost:3001**). The backend runs on port `3000` by default; `nodemon` restarts it when `server.js` or files under `backend/` change, and BrowserSync reloads the browser when files under `frontend/public/` change. The frontend uses the BrowserSync proxy for API calls, so the browser does not need to access the backend port directly. Stop both development processes with **Ctrl+C**. Use `npm start` for the regular server without development watchers.

If the default ports are already in use, stop the other server or choose free ports before starting. For example, in PowerShell:

```powershell
$env:PORT = 3100
$env:BROWSER_SYNC_PORT = 3101
npm run dev
```

---

## 📁 Clean File & Architecture Structure

```
University-Dental-Clinic/
├── backend/
│   ├── server.js               # Express API routes, auth, static file hosting
│   └── db.js                   # SQLite schema, migrations, password hashing & seeding
├── frontend/
│   └── public/
│       ├── index.html          # Frontend shell
│       ├── app.js              # Browser UI and API requests
│       ├── styles.css          # Frontend styles
│       └── dental_clinic_prototype.html
├── server.js                   # Root startup compatibility entry point
├── db.js                       # Root database import compatibility entry point
├── bs-config.cjs                # BrowserSync proxy and frontend watch configuration
├── clinic.db                   # 💾 SQLITE DATABASE: Persistent database storage
├── test/
│   └── api-test.js             # 🧪 AUTOMATED TESTS: 18 end-to-end integration & persistence tests
├── docs/
│   └── architecture.md         # 📐 Project development and architecture guidelines
├── package.json                # 📦 NPM CONFIG: Project dependencies and start/test scripts
├── README.md                   # 📖 DOCUMENTATION: Complete system guide and walkthrough
└── package-lock.json            # 📦 Locked dependency versions
```

### File Responsibilities:
* **`backend/server.js`** *(The Express API and server implementation)*:
  * Express HTTP web server listening on port `3000`.
  * Token-based cryptographic authentication (`crypto.scrypt` & HMAC-SHA256).
  * RESTful JSON API endpoints for patients, visits, appointments, inventory, prescriptions, referrals, reports, and accounts.
  * Serves only the frontend files in `frontend/public/` at `http://localhost:3000`.
* **`backend/db.js`**:
  * Utilizes Node 25's built-in `node:sqlite` (`DatabaseSync`), requiring zero C++ build tools.
  * Manages SQLite tables with foreign key constraints. The existing database remains at the project root.
  * Automatically handles schema migrations and seeds demo data on first launch.
* **`frontend/public/app.js`**:
  * Client-side single page application with fast client-side routing.
  * Interactive FDI Adult Tooth Chart (11–48) with condition brushes.
  * Interactive SVG Pie Graphs for clinical service distributions.
  * Dynamic form logic for Student vs Personnel intake and management approval workflows.
* **`frontend/public/styles.css`**:
  * Pure CSS with CSS custom properties (variables), dark/light mode support, and responsive layouts.
* **`server.js` and `db.js`**:
  * Root-level compatibility entry points preserve the existing `npm start`, `npm test`, and test imports while implementation moves into `backend/`.
* **`test/api-test.js`**:
  * Automated test suite covering all 18 authentication, CRUD, clinical, and reporting workflows.

---

## 🔑 Demo Credentials

All seeded demo accounts use the default password: **`password123`**

| Role | Username / Login | Full Name | Campus | Primary Capabilities |
| :--- | :--- | :--- | :--- | :--- |
| **Clinic Staff** | `ana.villanueva` | Ana Villanueva | Main Campus | Patient Intake, Appointments Approval, Pharmacy Inventory, Monthly Reports |
| **Clinic Staff** | `liza.ramos` | Liza Ramos | Satellite Campus A | Satellite A operations, inventory, and dispensing |
| **Dentist** | `ramon.cruz` | Dr. Ramon Cruz | Main Campus | Tooth charts, Clinical visits, Rx prescriptions, Referrals |
| **Dentist** | `lourdes.diaz` | Dr. Lourdes Diaz | Satellite Campus A | Satellite A clinical dental care |
| **Patient** | `maria.santos@univ.example` | Maria Santos | Main Campus | Student portal: book appointments, view records & history |
| **Patient** | `juan.delacruz@univ.example` | Juan dela Cruz | Main Campus | Student portal |

*(Tip: You can also use the 1-click **Demo Quick-Fill** buttons on the login screen to sign in instantly).*

---

## 🛠️ How the System Works (Key Features)

### 1. Student and Personnel Separation
* **Directories & Filters**: The Patient Directory has distinct tabs for **All Records**, **🎓 Students**, and **👔 Personnel & Faculty**.
* **Role-Specific Data**:
  * **Students**: Displays Student ID Number, Degree Program / Course (e.g. BS Nursing), and Year Level (1st–4th Year).
  * **Personnel**: Displays Employee ID Number, College / Office / Department, and Classification (Teaching Faculty vs Non-Teaching Staff).
* **Demographic Reports**: Reports and visits logs track students and personnel separately.

### 2. Manual Input of Patient Record
* Staff and Dentists can click **`+ Manual Input Patient Record`** in the Patient Directory.
* Includes a category toggle (`🎓 Student Record` vs `👔 Personnel Record`) that dynamically adjusts the input fields.
* Integrated Initial Medical & Dental History:
  * Drug allergies (Penicillin, NSAIDs, Aspirin, Latex).
  * Chronic conditions (Asthma, Diabetes, Hypertension, Heart Condition, Bleeding Disorder).
  * Current medications and past dental treatments.
* Instantly creates the patient profile, dental history record, and patient login account.

### 3. Clinical Visits Log & Core Services
* **Clinical Visits Log** (`/visits`): Tracks all dental clinic visits with tabs for **All Visits**, **Student Visits**, **Personnel Visits**, and **Emergency Walk-ins**.
* **Core Services**:
  * **Consultation**: Direct consultation logging with clinical notes.
  * **Oral Examination**: Examination linked to the interactive 32-tooth adult chart.
  * **Tooth Extraction**: Records treated FDI tooth numbers and procedural notes.
  * **Dental Referral**: Links patient to external hospitals/specialists with clinical indications.
  * **Other Procedures**: Prophylaxis (cleaning), fillings, fluoride application, abscess drainage, pit & fissure sealants.
* **Arrival Sources**:
  * **`🚨 Emergency Walk-in`**: For urgent acute toothache, trauma, or emergency dental care.
  * **`🚶 Routine Walk-in`**: For walk-in consultations and checkups.
  * **`📅 Scheduled Appointment`**: Linked to pre-booked slots.

### 4. Interactive Services Pie Graphs
* Located on the **Monthly Dental Service Reports** page (`/reports`) and summarized on the **Dashboard**.
* Displays 3 comparative SVG vector pie charts:
  1. **All Services Rendered** (Distribution of Consultations, Oral Exams, Tooth Extractions, Dental Referrals, and Other Procedures).
  2. **Student Services Breakdown** (Services utilized by university students).
  3. **Personnel Services Breakdown** (Services utilized by faculty and employees).
* Pure vector graphics with percentage calculations, hover tooltips, and interactive color legends.

### 5. Management Appointment Approval
* Located under **Appointments & Management Approval** (`/appointments`).
* Streamlined management workflow:
  * **Pending Management Approval**: Displays requests waiting for staff/dentist action with 1-click **Approve** and **Decline** (with optional reason modal).
  * **Approved Schedule**: Confirmed patient bookings with direct **Start Visit** and **Open Chart** actions.
  * **Declined & Cancelled**: History of rejected requests with stored justification notes.
  * **Client Filtering**: Easily filter appointments between Students and Personnel.

### 6. Campus Clinic Dedicated Medicine Inventory
* Located under **Campus Clinic Medicine Inventory** (`/inventory`).
* **Strict Campus Scope**: Pharmacy stock, active batches, deliveries (stock-in), corrections, and dispensing are dedicated specifically to the active Campus Clinic.
* **FEFO Dispensing**: First-Expired, First-Out automatic lot deduction linked directly to dentist prescriptions.

---

## 🧪 Automated Testing

The system includes an automated test suite verifying 18 test cases across authentication, role-based access control, database persistence, referrals, and reports:

```bash
npm test
```

### Test Suite Output:
```
--- Starting API & Persistence Automated Test Suite ---
1. Testing staff login... ✓
2. Testing invalid login rejection... ✓
3. Testing dentist login... ✓
4. Testing patient login... ✓
5. Testing role authorization: patient accessing inventory... ✓
6. Testing patients list and search... ✓
7. Testing patient comprehensive details... ✓
8. Testing dental history update and audit diff log... ✓
9. Testing dentist exam & tooth chart save... ✓
10. Testing appointment workflow: slot check -> booking -> approval... ✓
11. Testing prescription creation and FEFO dispensing... ✓
12. Testing referral creation and lifecycle update... ✓
13. Testing monthly reports calculation... ✓
14. Testing student and personnel separation in patients query... ✓
15. Testing manual input of patient record with dental history... ✓
16. Testing emergency walk-in visit recording with dental referral... ✓
17. Testing appointment management approval workflow... ✓
18. Testing services breakdown and demographics for pie graphs... ✓

✅ ALL 18 TEST CASES PASSED SUCCESSFULLY!
```

---

## 💻 Tech Stack
* **Runtime**: Node.js v22+ (tested on Node v25.9.0)
* **Backend Framework**: Express 4.x
* **Database**: `node:sqlite` (SQLite embedded in Node.js)
* **Frontend**: HTML5, Vanilla JavaScript (ES6+), CSS3 with CSS Custom Properties
* **Testing**: Node.js built-in `node:assert` & `node:http`
>>>>>>> main
