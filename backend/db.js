const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const crypto = require('node:crypto');

const DB_PATH = process.env.CLINIC_DB_PATH
  ? path.resolve(process.env.CLINIC_DB_PATH)
  : path.join(__dirname, '..', 'clinic.db');
const db = new DatabaseSync(DB_PATH);

// Pragmas for performance and integrity
db.exec('PRAGMA foreign_keys = ON;');

// Password hashing helpers
function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { salt, hash };
}

function verifyPassword(password, salt, hash) {
  try {
    const check = crypto.scryptSync(password, salt, 64).toString('hex');
    return check === hash;
  } catch {
    return false;
  }
}

// Initialize tables
function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS campuses (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      salt TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL, -- 'staff', 'dentist', 'patient'
      campus_id TEXT NOT NULL,
      active INTEGER DEFAULT 1,
      patient_id TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS patients (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL, -- 'student', 'faculty', 'personnel'
      campus_id TEXT NOT NULL,
      sex TEXT,
      birth TEXT,
      id_no TEXT NOT NULL,
      unit TEXT,
      level TEXT,
      email TEXT NOT NULL,
      phone TEXT,
      proof_name TEXT,
      registered_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS dental_histories (
      patient_id TEXT PRIMARY KEY,
      conditions TEXT, -- JSON array
      allergies TEXT,
      medications TEXT,
      past_treatment TEXT, -- JSON array
      updated_at TEXT,
      reviewed INTEGER DEFAULT 0,
      reviewed_by TEXT,
      reviewed_at TEXT,
      FOREIGN KEY(patient_id) REFERENCES patients(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS history_logs (
      id TEXT PRIMARY KEY,
      patient_id TEXT NOT NULL,
      ts TEXT NOT NULL,
      by_name TEXT NOT NULL,
      field TEXT NOT NULL,
      from_val TEXT,
      to_val TEXT,
      seen INTEGER DEFAULT 0,
      FOREIGN KEY(patient_id) REFERENCES patients(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS exams (
      id TEXT PRIMARY KEY,
      patient_id TEXT NOT NULL,
      date TEXT NOT NULL,
      by_name TEXT NOT NULL,
      teeth_json TEXT NOT NULL,
      gum TEXT,
      findings TEXT,
      needs TEXT,
      remarks TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY(patient_id) REFERENCES patients(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS appointments (
      id TEXT PRIMARY KEY,
      patient_id TEXT NOT NULL,
      campus_id TEXT NOT NULL,
      date TEXT NOT NULL,
      time TEXT NOT NULL,
      reason TEXT,
      status TEXT NOT NULL, -- 'Pending', 'Approved', 'Declined', 'Cancelled', 'Completed'
      created_at TEXT NOT NULL,
      FOREIGN KEY(patient_id) REFERENCES patients(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS visits (
      id TEXT PRIMARY KEY,
      patient_id TEXT NOT NULL,
      campus_id TEXT NOT NULL,
      date TEXT NOT NULL,
      source TEXT NOT NULL, -- 'Walk-in', 'Appointment'
      consult INTEGER DEFAULT 1,
      services_json TEXT NOT NULL,
      teeth TEXT,
      notes TEXT,
      dentist_name TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(patient_id) REFERENCES patients(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS services (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT NOT NULL, -- 'Oral examination', 'Extraction', 'Other procedure'
      active INTEGER DEFAULT 1,
      description TEXT
    );

    CREATE TABLE IF NOT EXISTS referrals (
      id TEXT PRIMARY KEY,
      patient_id TEXT NOT NULL,
      visit_id TEXT,
      campus_id TEXT NOT NULL,
      referred_to TEXT NOT NULL,
      reason TEXT NOT NULL,
      created_by TEXT NOT NULL,
      status TEXT NOT NULL, -- 'Referred', 'Contacted', 'Availed', 'Completed', 'Pending'
      dates_json TEXT NOT NULL,
      FOREIGN KEY(patient_id) REFERENCES patients(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS announcements (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      by_name TEXT NOT NULL,
      campus_id TEXT NOT NULL,
      date TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      recipient TEXT NOT NULL,
      date TEXT NOT NULL,
      text TEXT NOT NULL,
      email TEXT,
      is_read INTEGER DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS school_years (
      id TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      is_active INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS closed_slots (
      id TEXT PRIMARY KEY,
      campus_id TEXT NOT NULL,
      date TEXT NOT NULL,
      time TEXT NOT NULL
    );
  `);

  db.exec(`
    DROP TABLE IF EXISTS prescriptions;
    DROP TABLE IF EXISTS inventory_batches;
    DROP TABLE IF EXISTS inventory_ledger;
    DROP TABLE IF EXISTS medicines;
  `);

  // Migrate additional columns safely if table already exists
  try { db.exec('ALTER TABLE appointments ADD COLUMN notes TEXT;'); } catch (_) {}
  try { db.exec('ALTER TABLE appointments ADD COLUMN approved_by TEXT;'); } catch (_) {}
  try { db.exec('ALTER TABLE appointments ADD COLUMN approved_at TEXT;'); } catch (_) {}

  // Update sample emergency walk-in visits
  try { db.prepare("UPDATE visits SET source = 'Emergency Walk-in' WHERE id IN ('v2', 'v10');").run(); } catch (_) {}

  // Ensure services catalog includes core requested services: Consultation and Dental Referral
  try {
    const s9 = db.prepare('SELECT id FROM services WHERE id = ?;').get('s9');
    if (!s9) {
      db.prepare('INSERT OR IGNORE INTO services (id, name, category, active, description) VALUES (?, ?, ?, ?, ?);')
        .run('s9', 'Dental consultation', 'Consultation', 1, 'General dental consultation, diagnosis, and oral evaluation.');
    }
    const s10 = db.prepare('SELECT id FROM services WHERE id = ?;').get('s10');
    if (!s10) {
      db.prepare('INSERT OR IGNORE INTO services (id, name, category, active, description) VALUES (?, ?, ?, ?, ?);')
        .run('s10', 'Dental referral', 'Referral', 1, 'Clinical referral to external specialist, hospital, or tertiary dental facility.');
    }
  } catch (_) {}

  // Seed if empty
  seedDatabase();
}

function seedDatabase() {
  const check = db.prepare('SELECT COUNT(*) as count FROM users;').get();
  if (check && check.count > 0) return;

  console.log('Seeding database with initial production-grade data...');

  // Default password for all seeded accounts
  const defaultPw = 'password123';
  const { salt, hash } = hashPassword(defaultPw);

  // 1. Campuses
  const campuses = [
    { id: 'main', name: 'Main Campus', type: 'Main campus' },
    { id: 'sa', name: 'Satellite Campus A', type: 'Satellite campus' },
    { id: 'sb', name: 'Satellite Campus B', type: 'Satellite campus' }
  ];
  const stmtCampus = db.prepare('INSERT INTO campuses (id, name, type) VALUES (?, ?, ?);');
  for (const c of campuses) stmtCampus.run(c.id, c.name, c.type);

  // 2. School Year
  db.prepare(`
    INSERT INTO school_years (id, label, start_date, end_date, is_active)
    VALUES ('sy-2026', '2026-2027', '2026-08-03', '2027-05-28', 1);
  `).run();

  // 3. Services
  const services = [
    { id: 's1', name: 'Oral examination', category: 'Oral examination', active: 1, description: 'Check of teeth, gums, and mouth. Includes the tooth chart.' },
    { id: 's2', name: 'Oral prophylaxis (cleaning)', category: 'Other procedure', active: 1, description: 'Removal of plaque and tartar.' },
    { id: 's3', name: 'Tooth extraction', category: 'Extraction', active: 1, description: 'Removal of a tooth that cannot be saved.' },
    { id: 's4', name: 'Temporary filling', category: 'Other procedure', active: 1, description: 'Short-term filling while waiting for further treatment.' },
    { id: 's5', name: 'Permanent filling', category: 'Other procedure', active: 1, description: 'Restoration of a decayed tooth.' },
    { id: 's6', name: 'Fluoride application', category: 'Other procedure', active: 1, description: 'Topical fluoride to strengthen enamel.' },
    { id: 's7', name: 'Abscess drainage', category: 'Other procedure', active: 1, description: 'Relief of a dental abscess.' },
    { id: 's8', name: 'Pit and fissure sealant', category: 'Other procedure', active: 1, description: 'Protective coating for back teeth.' },
    { id: 's9', name: 'Dental consultation', category: 'Consultation', active: 1, description: 'General dental consultation, diagnosis, and oral evaluation.' },
    { id: 's10', name: 'Dental referral', category: 'Referral', active: 1, description: 'Clinical referral to external specialist, hospital, or tertiary dental facility.' }
  ];
  const stmtService = db.prepare('INSERT INTO services (id, name, category, active, description) VALUES (?, ?, ?, ?, ?);');
  for (const s of services) stmtService.run(s.id, s.name, s.category, s.active, s.description);

  // 4. Staff & Dentist Users
  const staffUsers = [
    { id: 'u1', username: 'ana.villanueva', name: 'Ana Villanueva', role: 'staff', campus: 'main' },
    { id: 'u2', username: 'ben.torres', name: 'Ben Torres', role: 'staff', campus: 'main' },
    { id: 'u3', username: 'ramon.cruz', name: 'Dr. Ramon Cruz', role: 'dentist', campus: 'main' },
    { id: 'u4', username: 'liza.ramos', name: 'Liza Ramos', role: 'staff', campus: 'sa' },
    { id: 'u5', username: 'lourdes.diaz', name: 'Dr. Lourdes Diaz', role: 'dentist', campus: 'sa' },
    { id: 'u6', username: 'joy.manalo', name: 'Joy Manalo', role: 'staff', campus: 'sb' },
    { id: 'u7', username: 'paolo.ilagan', name: 'Dr. Paolo Ilagan', role: 'dentist', campus: 'sb' }
  ];
  const stmtUser = db.prepare(`
    INSERT INTO users (id, username, password_hash, salt, name, role, campus_id, active, patient_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, '2026-08-01 08:00:00');
  `);
  for (const u of staffUsers) {
    stmtUser.run(u.id, u.username, hash, salt, u.name, u.role, u.campus, null);
  }

  // 5. Patients & Dental Histories
  const patients = [
    { id: 'p1', name: 'Maria Santos', type: 'student', campus: 'main', sex: 'Female', birth: '2005-03-14', idNo: '2024-01234', unit: 'BS Nursing', level: '2nd year', email: 'maria.santos@univ.example', phone: '0917 000 1101', proof: 'COR_2026-1st-sem.pdf', conds: ['Asthma'], all: 'None', meds: 'Salbutamol inhaler (as needed)', past: ['Cleaning', 'Filling'], reviewed: 1, revBy: 'Dr. Ramon Cruz', revAt: '2026-08-12' },
    { id: 'p2', name: 'Juan dela Cruz', type: 'student', campus: 'main', sex: 'Male', birth: '2004-11-02', idNo: '2023-04410', unit: 'BS Education', level: '3rd year', email: 'juan.delacruz@univ.example', phone: '0917 000 1102', proof: 'COR_2026-1st-sem.pdf', conds: [], all: 'Penicillin', meds: 'None', past: ['Extraction'], reviewed: 0, revBy: null, revAt: null },
    { id: 'p3', name: 'Elena Reyes', type: 'faculty', campus: 'main', sex: 'Female', birth: '1979-06-21', idNo: 'EMP-10442', unit: 'College of Arts and Sciences', level: '', email: 'elena.reyes@univ.example', phone: '0917 000 1103', proof: 'Employee_ID.jpg', conds: ['High blood pressure'], all: 'None', meds: 'Losartan 50 mg', past: ['Cleaning'], reviewed: 1, revBy: 'Dr. Ramon Cruz', revAt: '2026-08-12' },
    { id: 'p4', name: 'Carlo Mendoza', type: 'personnel', campus: 'main', sex: 'Male', birth: '1988-01-30', idNo: 'EMP-20981', unit: "Registrar's Office", level: 'Records Officer', email: 'carlo.mendoza@univ.example', phone: '0917 000 1104', proof: 'Employee_ID.jpg', conds: [], all: 'Aspirin', meds: 'None', past: ['Filling', 'Extraction'], reviewed: 1, revBy: 'Dr. Ramon Cruz', revAt: '2026-08-12' },
    { id: 'p5', name: 'Angela Lim', type: 'student', campus: 'main', sex: 'Female', birth: '2006-02-08', idNo: '2025-00871', unit: 'BS Accountancy', level: '1st year', email: 'angela.lim@univ.example', phone: '0917 000 1105', proof: 'COR_2026-1st-sem.pdf', conds: [], all: 'None', meds: 'None', past: [], reviewed: 1, revBy: 'Dr. Ramon Cruz', revAt: '2026-08-12' },
    { id: 'p6', name: 'Paolo Garcia', type: 'student', campus: 'main', sex: 'Male', birth: '2003-09-17', idNo: '2022-03318', unit: 'BS Information Technology', level: '4th year', email: 'paolo.garcia@univ.example', phone: '0917 000 1106', proof: 'COR_2026-1st-sem.pdf', conds: ['Diabetes'], all: 'None', meds: 'Metformin 500 mg', past: ['Cleaning', 'Braces'], reviewed: 1, revBy: 'Dr. Ramon Cruz', revAt: '2026-08-12' },
    { id: 'p7', name: 'Rico Bautista', type: 'student', campus: 'sa', sex: 'Male', birth: '2005-05-25', idNo: '2024-07712', unit: 'BS Agriculture', level: '2nd year', email: 'rico.bautista@univ.example', phone: '0917 000 1107', proof: 'COR_2026-1st-sem.pdf', conds: [], all: 'None', meds: 'None', past: ['Filling'], reviewed: 1, revBy: 'Dr. Lourdes Diaz', revAt: '2026-08-12' },
    { id: 'p8', name: 'Jenny Ortega', type: 'faculty', campus: 'sa', sex: 'Female', birth: '1984-12-03', idNo: 'EMP-11875', unit: 'College of Agriculture', level: '', email: 'jenny.ortega@univ.example', phone: '0917 000 1108', proof: 'Employee_ID.jpg', conds: ['Diabetes'], all: 'None', meds: 'Metformin 500 mg', past: ['Cleaning'], reviewed: 1, revBy: 'Dr. Lourdes Diaz', revAt: '2026-08-12' },
    { id: 'p9', name: 'Mark Aquino', type: 'student', campus: 'sa', sex: 'Male', birth: '2004-04-19', idNo: '2023-06120', unit: 'BS Forestry', level: '3rd year', email: 'mark.aquino@univ.example', phone: '0917 000 1109', proof: 'COR_2026-1st-sem.pdf', conds: [], all: 'None', meds: 'None', past: [], reviewed: 1, revBy: 'Dr. Lourdes Diaz', revAt: '2026-08-12' },
    { id: 'p10', name: 'Nina Flores', type: 'student', campus: 'sb', sex: 'Female', birth: '2005-08-11', idNo: '2024-09054', unit: 'BS Biology', level: '2nd year', email: 'nina.flores@univ.example', phone: '0917 000 1110', proof: 'COR_2026-1st-sem.pdf', conds: [], all: 'None', meds: 'None', past: ['Cleaning'], reviewed: 1, revBy: 'Dr. Paolo Ilagan', revAt: '2026-08-12' },
    { id: 'p11', name: 'Tomas Villar', type: 'personnel', campus: 'sb', sex: 'Male', birth: '1976-07-07', idNo: 'EMP-30215', unit: 'Maintenance Office', level: 'Utility Supervisor', email: 'tomas.villar@univ.example', phone: '0917 000 1111', proof: 'Employee_ID.jpg', conds: ['Heart condition'], all: 'None', meds: 'Aspirin 80 mg', past: [], reviewed: 1, revBy: 'Dr. Paolo Ilagan', revAt: '2026-08-12' }
  ];

  const stmtPat = db.prepare(`
    INSERT INTO patients (id, name, type, campus_id, sex, birth, id_no, unit, level, email, phone, proof_name, registered_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '2026-08-05');
  `);
  const stmtHist = db.prepare(`
    INSERT INTO dental_histories (patient_id, conditions, allergies, medications, past_treatment, updated_at, reviewed, reviewed_by, reviewed_at)
    VALUES (?, ?, ?, ?, ?, '2026-08-05', ?, ?, ?);
  `);

  for (const p of patients) {
    stmtPat.run(p.id, p.name, p.type, p.campus, p.sex, p.birth, p.idNo, p.unit, p.level, p.email, p.phone, p.proof);
    stmtHist.run(p.id, JSON.stringify(p.conds), p.all, p.meds, JSON.stringify(p.past), p.reviewed, p.revBy, p.revAt);

    // Create user login for patient
    const username = p.email.split('@')[0];
    stmtUser.run('u_' + p.id, username, hash, salt, p.name, 'patient', p.campus, p.id);
  }

  // Patient history log for Juan dela Cruz
  db.prepare(`
    INSERT INTO history_logs (id, patient_id, ts, by_name, field, from_val, to_val, seen)
    VALUES ('h1', 'p2', '2026-09-19 18:42', 'Juan dela Cruz (patient)', 'Allergies', 'None', 'Penicillin', 0);
  `).run();

  // 6. Initial Dental Exams with Tooth Charts
  const exams = [
    { id: 'e1', patientId: 'p1', date: '2026-09-16', by: 'Dr. Ramon Cruz', teeth: { '16': 'filled', '36': 'decayed', '48': 'missing' }, gum: 'Healthy', findings: 'Good oral hygiene. One new cavity on tooth 36.', needs: 'Filling for tooth 36', remarks: 'Recheck in 6 months.' },
    { id: 'e2', patientId: 'p2', date: '2026-09-03', by: 'Dr. Ramon Cruz', teeth: { '38': 'extracted', '48': 'extracted', '26': 'decayed' }, gum: 'Mild inflammation', findings: 'Impacted lower third molars removed. Decay on tooth 26.', needs: 'Filling for tooth 26', remarks: '' },
    { id: 'e3', patientId: 'p7', date: '2026-09-07', by: 'Dr. Lourdes Diaz', teeth: { '46': 'filled', '17': 'decayed' }, gum: 'Healthy', findings: 'Filling placed on tooth 46. Early decay on tooth 17.', needs: 'Monitor tooth 17', remarks: '' }
  ];
  const stmtExam = db.prepare(`
    INSERT INTO exams (id, patient_id, date, by_name, teeth_json, gum, findings, needs, remarks, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
  `);
  for (const e of exams) {
    stmtExam.run(e.id, e.patientId, e.date, e.by, JSON.stringify(e.teeth), e.gum, e.findings, e.needs, e.remarks, e.date + ' 10:00:00');
  }

  // 7. Visits
  const visits = [
    { id: 'v1', pid: 'p1', date: '2026-08-12', campus: 'main', src: 'Walk-in', consult: 1, svcs: ['s1', 's2'], teeth: '', notes: 'First visit. Cleaning done.', dentist: 'Dr. Ramon Cruz' },
    { id: 'v2', pid: 'p2', date: '2026-08-13', campus: 'main', src: 'Emergency Walk-in', consult: 1, svcs: ['s1', 's3'], teeth: '38', notes: 'Emergency extraction of impacted third molar.', dentist: 'Dr. Ramon Cruz' },
    { id: 'v3', pid: 'p3', date: '2026-08-18', campus: 'main', src: 'Appointment', consult: 1, svcs: ['s1'], teeth: '', notes: 'Routine check.', dentist: 'Dr. Ramon Cruz' },
    { id: 'v4', pid: 'p5', date: '2026-08-20', campus: 'main', src: 'Walk-in', consult: 1, svcs: ['s1', 's4'], teeth: '46', notes: 'Temporary filling placed.', dentist: 'Dr. Ramon Cruz' },
    { id: 'v5', pid: 'p6', date: '2026-08-26', campus: 'main', src: 'Walk-in', consult: 0, svcs: ['s1', 's6'], teeth: '', notes: 'Fluoride application.', dentist: 'Dr. Ramon Cruz' },
    { id: 'v6', pid: 'p4', date: '2026-08-27', campus: 'main', src: 'Appointment', consult: 1, svcs: ['s1', 's3'], teeth: '28', notes: 'Extraction. Referred for follow-up.', dentist: 'Dr. Ramon Cruz' },
    { id: 'v7', pid: 'p1', date: '2026-09-02', campus: 'main', src: 'Appointment', consult: 1, svcs: ['s5'], teeth: '16', notes: 'Permanent filling.', dentist: 'Dr. Ramon Cruz' },
    { id: 'v8', pid: 'p2', date: '2026-09-03', campus: 'main', src: 'Walk-in', consult: 1, svcs: ['s1', 's5'], teeth: '26', notes: 'Follow-up and filling.', dentist: 'Dr. Ramon Cruz' },
    { id: 'v9', pid: 'p5', date: '2026-09-08', campus: 'main', src: 'Appointment', consult: 0, svcs: ['s5'], teeth: '46', notes: 'Permanent filling. Root canal referral.', dentist: 'Dr. Ramon Cruz' },
    { id: 'v10', pid: 'p6', date: '2026-09-09', campus: 'main', src: 'Emergency Walk-in', consult: 1, svcs: ['s1', 's3'], teeth: '18', notes: 'Emergency extraction of tooth 18.', dentist: 'Dr. Ramon Cruz' },
    { id: 'v11', pid: 'p3', date: '2026-09-10', campus: 'main', src: 'Appointment', consult: 1, svcs: ['s2'], teeth: '', notes: 'Oral prophylaxis.', dentist: 'Dr. Ramon Cruz' },
    { id: 'v12', pid: 'p4', date: '2026-09-15', campus: 'main', src: 'Walk-in', consult: 1, svcs: ['s1'], teeth: '', notes: 'Post-extraction check.', dentist: 'Dr. Ramon Cruz' },
    { id: 'v13', pid: 'p1', date: '2026-09-16', campus: 'main', src: 'Walk-in', consult: 1, svcs: ['s1'], teeth: '36', notes: 'Oral examination. Cavity found on tooth 36.', dentist: 'Dr. Ramon Cruz' },
    { id: 'v14', pid: 'p2', date: '2026-09-17', campus: 'main', src: 'Walk-in', consult: 0, svcs: ['s3'], teeth: '48', notes: 'Extraction of tooth 48.', dentist: 'Dr. Ramon Cruz' },
    { id: 'v15', pid: 'p6', date: '2026-09-18', campus: 'main', src: 'Appointment', consult: 0, svcs: ['s6', 's8'], teeth: '', notes: 'Fluoride and sealants.', dentist: 'Dr. Ramon Cruz' },
    { id: 'v16', pid: 'p7', date: '2026-08-19', campus: 'sa', src: 'Walk-in', consult: 1, svcs: ['s1', 's3'], teeth: '38', notes: 'Extraction.', dentist: 'Dr. Lourdes Diaz' },
    { id: 'v17', pid: 'p8', date: '2026-08-24', campus: 'sa', src: 'Walk-in', consult: 1, svcs: ['s1'], teeth: '', notes: 'Oral examination.', dentist: 'Dr. Lourdes Diaz' },
    { id: 'v18', pid: 'p9', date: '2026-09-01', campus: 'sa', src: 'Walk-in', consult: 1, svcs: ['s1', 's4'], teeth: '36', notes: 'Temporary filling.', dentist: 'Dr. Lourdes Diaz' },
    { id: 'v19', pid: 'p7', date: '2026-09-07', campus: 'sa', src: 'Appointment', consult: 0, svcs: ['s5'], teeth: '46', notes: 'Permanent filling.', dentist: 'Dr. Lourdes Diaz' },
    { id: 'v20', pid: 'p8', date: '2026-09-14', campus: 'sa', src: 'Walk-in', consult: 1, svcs: ['s1', 's2'], teeth: '', notes: 'Examination and cleaning. Referred for gum care.', dentist: 'Dr. Lourdes Diaz' },
    { id: 'v21', pid: 'p9', date: '2026-09-17', campus: 'sa', src: 'Walk-in', consult: 0, svcs: ['s3'], teeth: '38', notes: 'Extraction.', dentist: 'Dr. Lourdes Diaz' },
    { id: 'v22', pid: 'p10', date: '2026-08-20', campus: 'sb', src: 'Walk-in', consult: 1, svcs: ['s1'], teeth: '', notes: 'Oral examination.', dentist: 'Dr. Paolo Ilagan' },
    { id: 'v23', pid: 'p11', date: '2026-09-03', campus: 'sb', src: 'Walk-in', consult: 1, svcs: ['s1', 's3'], teeth: '47', notes: 'Extraction. Referred for x-ray.', dentist: 'Dr. Paolo Ilagan' },
    { id: 'v24', pid: 'p10', date: '2026-09-15', campus: 'sb', src: 'Appointment', consult: 0, svcs: ['s2'], teeth: '', notes: 'Oral prophylaxis.', dentist: 'Dr. Paolo Ilagan' }
  ];
  const stmtVisit = db.prepare(`
    INSERT INTO visits (id, patient_id, campus_id, date, source, consult, services_json, teeth, notes, dentist_name, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
  `);
  for (const v of visits) {
    stmtVisit.run(v.id, v.pid, v.campus, v.date, v.src, v.consult, JSON.stringify(v.svcs), v.teeth, v.notes, v.dentist, v.date + ' 09:00:00');
  }

  // 8. Referrals
  const referrals = [
    { id: 'rf1', pid: 'p2', vid: 'v2', campus: 'main', to: 'City General Hospital, Oral Surgery', reason: 'Follow-up of impacted third molar removal', by: 'Dr. Ramon Cruz', dates: { Referred: '2026-08-13', Contacted: '2026-08-18', Availed: '2026-09-01' }, status: 'Availed' },
    { id: 'rf2', pid: 'p5', vid: 'v9', campus: 'main', to: 'Dr. A. Tan, Endodontist (private)', reason: 'Root canal treatment, tooth 46', by: 'Dr. Ramon Cruz', dates: { Referred: '2026-09-08' }, status: 'Referred' },
    { id: 'rf3', pid: 'p4', vid: 'v6', campus: 'main', to: 'City General Hospital, Oral Surgery', reason: 'Post-extraction evaluation', by: 'Dr. Ramon Cruz', dates: { Referred: '2026-08-27', Contacted: '2026-09-01', Availed: '2026-09-08' }, status: 'Pending' },
    { id: 'rf4', pid: 'p8', vid: 'v20', campus: 'sa', to: 'Provincial Dental Clinic', reason: 'Periodontal (gum) treatment', by: 'Dr. Lourdes Diaz', dates: { Referred: '2026-09-14', Contacted: '2026-09-16' }, status: 'Contacted' },
    { id: 'rf5', pid: 'p11', vid: 'v23', campus: 'sb', to: 'District Hospital, Dental Department', reason: 'Full-mouth x-ray series', by: 'Dr. Paolo Ilagan', dates: { Referred: '2026-09-03', Contacted: '2026-09-05', Availed: '2026-09-10', Completed: '2026-09-12' }, status: 'Completed' }
  ];
  const stmtRef = db.prepare(`
    INSERT INTO referrals (id, patient_id, visit_id, campus_id, referred_to, reason, created_by, status, dates_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);
  `);
  for (const r of referrals) {
    stmtRef.run(r.id, r.pid, r.vid, r.campus, r.to, r.reason, r.by, r.status, JSON.stringify(r.dates));
  }

  // 9. Appointments
  const appointments = [
    { id: 'a1', pid: 'p1', campus: 'main', date: '2026-09-24', time: '09:00', reason: 'Filling for tooth 36', status: 'Approved' },
    { id: 'a2', pid: 'p2', campus: 'main', date: '2026-09-22', time: '10:00', reason: 'Toothache', status: 'Pending' },
    { id: 'a3', pid: 'p5', campus: 'main', date: '2026-09-23', time: '14:00', reason: 'Follow-up after filling', status: 'Pending' },
    { id: 'a4', pid: 'p7', campus: 'sa', date: '2026-09-22', time: '09:00', reason: 'Toothache', status: 'Pending' },
    { id: 'a5', pid: 'p3', campus: 'main', date: '2026-09-21', time: '11:00', reason: 'Cleaning', status: 'Approved' },
    { id: 'a6', pid: 'p1', campus: 'main', date: '2026-09-02', time: '10:00', reason: 'Filling', status: 'Completed' },
    { id: 'a7', pid: 'p10', campus: 'sb', date: '2026-09-23', time: '10:00', reason: 'Check-up', status: 'Approved' },
    { id: 'a8', pid: 'p9', campus: 'sa', date: '2026-09-11', time: '13:00', reason: 'Check-up', status: 'Cancelled' },
    { id: 'a9', pid: 'p6', campus: 'main', date: '2026-09-18', time: '14:00', reason: 'Fluoride and sealants', status: 'Completed' }
  ];
  const stmtAppt = db.prepare(`
    INSERT INTO appointments (id, patient_id, campus_id, date, time, reason, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, '2026-09-18 09:00:00');
  `);
  for (const a of appointments) {
    stmtAppt.run(a.id, a.pid, a.campus, a.date, a.time, a.reason, a.status);
  }

  // 10. Closed time slots
  const closed = [
    { id: 'c1', campus: 'main', date: '2026-09-24', time: '13:00' },
    { id: 'c2', campus: 'main', date: '2026-09-24', time: '14:00' },
    { id: 'c3', campus: 'main', date: '2026-09-24', time: '15:00' },
    { id: 'c4', campus: 'main', date: '2026-09-25', time: '13:00' },
    { id: 'c5', campus: 'main', date: '2026-09-25', time: '14:00' },
    { id: 'c6', campus: 'main', date: '2026-09-25', time: '15:00' },
    { id: 'c7', campus: 'sa', date: '2026-09-25', time: '13:00' },
    { id: 'c8', campus: 'sa', date: '2026-09-25', time: '14:00' },
    { id: 'c9', campus: 'sa', date: '2026-09-25', time: '15:00' }
  ];
  const stmtClosed = db.prepare('INSERT INTO closed_slots (id, campus_id, date, time) VALUES (?, ?, ?, ?);');
  for (const cs of closed) stmtClosed.run(cs.id, cs.campus, cs.date, cs.time);

  // 11. Announcements
  const announcements = [
    { id: 'n1', title: 'Dental check-up week: September 28 to October 2', body: 'Free oral examinations for all students, faculty, and personnel. Book a slot under My appointments.', by: 'Ana Villanueva', campus: 'main', date: '2026-09-18' },
    { id: 'n2', title: 'Reminder: keep your dental history up to date', body: 'If you have a new allergy, illness, or medicine, update your dental history before your visit.', by: 'Ana Villanueva', campus: 'main', date: '2026-09-10' }
  ];
  const stmtAnn = db.prepare('INSERT INTO announcements (id, title, body, by_name, campus_id, date, created_at) VALUES (?, ?, ?, ?, ?, ?, ?);');
  for (const an of announcements) stmtAnn.run(an.id, an.title, an.body, an.by, an.campus, an.date, an.date + ' 08:00:00');

  // 12. Notifications
  const notifs = [
    { id: 'nt1', to: 'patient:p1', date: '2026-09-20', text: 'Your appointment on Thu, Sep 24, 2026 at 9:00 AM was approved.', email: 'maria.santos@univ.example', read: 0 },
    { id: 'nt2', to: 'patient:p1', date: '2026-09-18', text: 'New announcement: Dental check-up week: September 28 to October 2.', email: 'maria.santos@univ.example', read: 1 },
    { id: 'nt3', to: 'staff:main', date: '2026-09-20', text: 'New appointment request from Juan dela Cruz for Tue, Sep 22, 2026 at 10:00 AM.', email: 'Clinic Staff', read: 0 },
    { id: 'nt5', to: 'staff:sa', date: '2026-09-20', text: 'New appointment request from Rico Bautista for Tue, Sep 22, 2026 at 9:00 AM.', email: 'Clinic Staff', read: 0 }
  ];
  const stmtNotif = db.prepare('INSERT INTO notifications (id, recipient, date, text, email, is_read, created_at) VALUES (?, ?, ?, ?, ?, ?, ?);');
  for (const nt of notifs) stmtNotif.run(nt.id, nt.to, nt.date, nt.text, nt.email, nt.read, nt.date + ' 08:00:00');

  console.log('Database seeded successfully.');
}

// Initialize on module load
initDatabase();

module.exports = {
  db,
  hashPassword,
  verifyPassword
};
