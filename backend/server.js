const express = require('express');
const path = require('node:path');
const crypto = require('node:crypto');
const { db, hashPassword, verifyPassword } = require('./db.js');

const app = express();
const PORT = process.env.PORT || 3000;
const SECRET = process.env.JWT_SECRET || 'dental-clinic-super-secret-key-2026';
const FRONTEND_DIR = path.join(__dirname, '..', 'frontend', 'public');

// CORS Middleware to support Live Server, cross-origin dev tools, and browser extensions
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin');
  res.setHeader('Access-Control-Max-Age', '86400');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Middleware
app.use(express.json());
app.use(express.static(FRONTEND_DIR));

// Default root route to serve index.html
app.get('/', (req, res) => {
  res.sendFile(path.join(FRONTEND_DIR, 'index.html'));
});

// Helper: UUID/ID generation
const nid = p => p + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const todayStr = () => new Date().toISOString().slice(0, 10);
const nowStr = () => {
  const d = new Date();
  return d.toISOString().slice(0, 10) + ' ' + d.toTimeString().slice(0, 5);
};

// Cryptographic token helpers
function signToken(user) {
  const payload = JSON.stringify({
    id: user.id,
    username: user.username,
    name: user.name,
    role: user.role,
    campus_id: user.campus_id,
    patient_id: user.patient_id,
    exp: Date.now() + 7 * 24 * 60 * 60 * 1000 // 7 days
  });
  const b64Payload = Buffer.from(payload).toString('base64url');
  const signature = crypto.createHmac('sha256', SECRET).update(b64Payload).digest('base64url');
  return `${b64Payload}.${signature}`;
}

function verifyToken(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [b64Payload, signature] = parts;
  const expectedSig = crypto.createHmac('sha256', SECRET).update(b64Payload).digest('base64url');
  if (signature !== expectedSig) return null;
  try {
    const payload = JSON.parse(Buffer.from(b64Payload, 'base64url').toString('utf8'));
    if (payload.exp && Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

// Authentication Middleware
function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  let token = null;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7).trim();
  } else if (req.query && req.query.token) {
    token = req.query.token;
  }
  const user = verifyToken(token);
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized: Missing or invalid token' });
  }
  req.user = user;
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden: Insufficient permissions' });
    }
    next();
  };
}

function isMainStaff(user) {
  return user.role === 'staff' && user.campus_id === 'main';
}

/* =========================================================================
   AUTH ROUTES
   ========================================================================= */

// POST /api/auth/login
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }
  const term = username.trim().toLowerCase();
  const user = db.prepare(`
    SELECT u.*
    FROM users u
    LEFT JOIN patients p ON u.patient_id = p.id
    WHERE (u.username = ? OR p.email = ?) AND u.active = 1;
  `).get(term, term);
  if (!user) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }
  const isValid = verifyPassword(password, user.salt, user.password_hash);
  if (!isValid) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }

  const campus = db.prepare('SELECT * FROM campuses WHERE id = ?;').get(user.campus_id);
  const token = signToken(user);
  res.json({
    token,
    user: {
      id: user.id,
      username: user.username,
      name: user.name,
      role: user.role,
      campus_id: user.campus_id,
      campus_name: campus ? campus.name : user.campus_id,
      patient_id: user.patient_id
    }
  });
});

// GET /api/auth/me
app.get('/api/auth/me', authenticate, (req, res) => {
  const user = db.prepare('SELECT id, username, name, role, campus_id, patient_id, active FROM users WHERE id = ?;').get(req.user.id);
  if (!user || !user.active) {
    return res.status(401).json({ error: 'User not found or deactivated' });
  }
  const campus = db.prepare('SELECT * FROM campuses WHERE id = ?;').get(user.campus_id);
  res.json({
    user: {
      ...user,
      campus_name: campus ? campus.name : user.campus_id
    }
  });
});

// POST /api/auth/register (Patient self-registration)
app.post('/api/auth/register', (req, res) => {
  const { first_name, last_name, type, campus_id, sex, birth, id_no, unit, level, email, phone, proof_name, password, conditions, allergies, medications, past_treatment } = req.body;

  if (!first_name || !last_name || !email || !campus_id || !id_no) {
    return res.status(400).json({ error: 'Required fields: first_name, last_name, email, campus_id, id_no' });
  }

  const existing = db.prepare('SELECT id FROM users WHERE username = ?;').get(email.toLowerCase().trim());
  if (existing) {
    return res.status(400).json({ error: 'An account with this email already exists' });
  }

  const patientId = nid('p');
  const userId = 'u_' + patientId;
  const fullName = `${first_name.trim()} ${last_name.trim()}`;
  const username = email.trim().toLowerCase();
  const { salt, hash } = hashPassword(password || 'password123');
  const regDate = todayStr();

  try {
    db.exec('BEGIN TRANSACTION;');

    db.prepare(`
      INSERT INTO patients (id, name, type, campus_id, sex, birth, id_no, unit, level, email, phone, proof_name, registered_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
    `).run(patientId, fullName, type || 'student', campus_id, sex || '', birth || '', id_no, unit || '', level || '', email, phone || '', proof_name || 'id.pdf', regDate);

    db.prepare(`
      INSERT INTO dental_histories (patient_id, conditions, allergies, medications, past_treatment, updated_at, reviewed, reviewed_by, reviewed_at)
      VALUES (?, ?, ?, ?, ?, ?, 0, NULL, NULL);
    `).run(patientId, JSON.stringify(conditions || []), allergies || 'None', medications || 'None', JSON.stringify(past_treatment || []), regDate);

    db.prepare(`
      INSERT INTO users (id, username, password_hash, salt, name, role, campus_id, active, patient_id, created_at)
      VALUES (?, ?, ?, ?, ?, 'patient', ?, 1, ?, ?);
    `).run(userId, username, hash, salt, fullName, campus_id, patientId, nowStr());

    db.exec('COMMIT;');

    const campus = db.prepare('SELECT * FROM campuses WHERE id = ?;').get(campus_id);
    const token = signToken({ id: userId, username, name: fullName, role: 'patient', campus_id, patient_id: patientId });

    res.status(201).json({
      message: 'Registration successful',
      token,
      user: {
        id: userId,
        username,
        name: fullName,
        role: 'patient',
        campus_id,
        campus_name: campus ? campus.name : campus_id,
        patient_id: patientId
      }
    });
  } catch (err) {
    db.exec('ROLLBACK;');
    console.error('Registration error:', err);
    res.status(500).json({ error: 'Failed to create account: ' + err.message });
  }
});

// POST /api/auth/logout
app.post('/api/auth/logout', authenticate, (req, res) => {
  res.json({ message: 'Logged out successfully' });
});

/* =========================================================================
   PATIENTS API
   ========================================================================= */

// GET /api/patients
app.get('/api/patients', authenticate, (req, res) => {
  const { search, type, campus } = req.query;
  let targetCampus = req.user.campus_id;
  if (isMainStaff(req.user) && campus) {
    targetCampus = campus === 'all' ? null : campus;
  }

  let sql = `
    SELECT p.*, h.allergies, h.conditions, h.reviewed as history_reviewed
    FROM patients p
    LEFT JOIN dental_histories h ON p.id = h.patient_id
    WHERE 1=1
  `;
  const params = [];

  if (req.user.role === 'patient') {
    sql += ' AND p.id = ?';
    params.push(req.user.patient_id);
  } else if (targetCampus) {
    sql += ' AND p.campus_id = ?';
    params.push(targetCampus);
  }

  if (type && type !== 'all') {
    if (type === 'personnel') {
      sql += ' AND (p.type = ? OR p.type = ?)';
      params.push('personnel', 'faculty');
    } else {
      sql += ' AND p.type = ?';
      params.push(type);
    }
  }

  if (search) {
    sql += ' AND (p.name LIKE ? OR p.id_no LIKE ? OR p.email LIKE ?)';
    const term = `%${search.trim()}%`;
    params.push(term, term, term);
  }

  sql += ' ORDER BY p.name ASC;';
  const patients = db.prepare(sql).all(...params);
  res.json({ patients });
});

// GET /api/patients/:id
app.get('/api/patients/:id', authenticate, (req, res) => {
  const { id } = req.params;
  if (req.user.role === 'patient' && req.user.patient_id !== id) {
    return res.status(403).json({ error: 'Forbidden: Access denied to other patient records' });
  }

  const patient = db.prepare('SELECT * FROM patients WHERE id = ?;').get(id);
  if (!patient) {
    return res.status(404).json({ error: 'Patient not found' });
  }

  if (req.user.role !== 'patient' && !isMainStaff(req.user) && patient.campus_id !== req.user.campus_id) {
    return res.status(403).json({ error: 'Forbidden: Patient belongs to a different campus' });
  }

  const history = db.prepare('SELECT * FROM dental_histories WHERE patient_id = ?;').get(id);
  if (history) {
    history.conditions = JSON.parse(history.conditions || '[]');
    history.past_treatment = JSON.parse(history.past_treatment || '[]');
  }
  const historyLog = db.prepare('SELECT * FROM history_logs WHERE patient_id = ? ORDER BY ts DESC;').all(id);
  const exams = db.prepare('SELECT * FROM exams WHERE patient_id = ? ORDER BY date DESC;').all(id);
  exams.forEach(e => { e.teeth = JSON.parse(e.teeth_json || '{}'); });
  const visits = db.prepare('SELECT * FROM visits WHERE patient_id = ? ORDER BY date DESC;').all(id);
  visits.forEach(v => { v.services = JSON.parse(v.services_json || '[]'); });
  const appointments = db.prepare('SELECT * FROM appointments WHERE patient_id = ? ORDER BY date DESC, time DESC;').all(id);
  const prescriptions = db.prepare(`
    SELECT r.*, m.name as medicine_name, m.unit as medicine_unit
    FROM prescriptions r
    JOIN medicines m ON r.med_id = m.id
    WHERE r.patient_id = ?
    ORDER BY r.date DESC;
  `).all(id);
  const referrals = db.prepare('SELECT * FROM referrals WHERE patient_id = ? ORDER BY id DESC;').all(id);
  referrals.forEach(r => { r.dates = JSON.parse(r.dates_json || '{}'); });

  res.json({
    patient,
    history,
    historyLog,
    exams,
    visits,
    appointments,
    prescriptions,
    referrals
  });
});

// POST /api/patients (Staff/Dentist direct entry)
app.post('/api/patients', authenticate, requireRole('staff', 'dentist'), (req, res) => {
  const { name, type, sex, birth, id_no, unit, level, email, phone, proof_name, campus_id, conditions, allergies, medications, past_treatment } = req.body;
  if (!name || !id_no || !email) {
    return res.status(400).json({ error: 'Name, ID number, and Email are required' });
  }

  const campus = (isMainStaff(req.user) && campus_id) ? campus_id : req.user.campus_id;
  const id = nid('p');
  const regDate = todayStr();

  try {
    db.exec('BEGIN TRANSACTION;');
    db.prepare(`
      INSERT INTO patients (id, name, type, campus_id, sex, birth, id_no, unit, level, email, phone, proof_name, registered_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
    `).run(id, name, type || 'student', campus, sex || '', birth || '', id_no, unit || '', level || '', email, phone || '', proof_name || 'ID_card.jpg', regDate);

    db.prepare(`
      INSERT INTO dental_histories (patient_id, conditions, allergies, medications, past_treatment, updated_at, reviewed, reviewed_by, reviewed_at)
      VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?);
    `).run(id, JSON.stringify(conditions || []), allergies || 'None', medications || 'None', JSON.stringify(past_treatment || []), regDate, req.user.name, regDate);

    // Create user login credentials if not already registered
    const { salt, hash } = hashPassword('password123');
    const username = email.toLowerCase().trim();
    const existingUser = db.prepare('SELECT id FROM users WHERE username = ?;').get(username);
    if (!existingUser) {
      db.prepare(`
        INSERT INTO users (id, username, password_hash, salt, name, role, campus_id, active, patient_id, created_at)
        VALUES (?, ?, ?, ?, ?, 'patient', ?, 1, ?, ?);
      `).run('u_' + id, username, hash, salt, name, campus, id, nowStr());
    }

    db.exec('COMMIT;');
    res.status(201).json({ message: 'Patient created successfully', id });
  } catch (err) {
    db.exec('ROLLBACK;');
    res.status(500).json({ error: 'Failed to create patient: ' + err.message });
  }
});

// PUT /api/patients/:id
app.put('/api/patients/:id', authenticate, (req, res) => {
  const { id } = req.params;
  const patient = db.prepare('SELECT * FROM patients WHERE id = ?;').get(id);
  if (!patient) return res.status(404).json({ error: 'Patient not found' });

  if (req.user.role === 'patient' && req.user.patient_id !== id) {
    return res.status(403).json({ error: 'Forbidden: Cannot update other patients' });
  }
  if (req.user.role !== 'patient' && !isMainStaff(req.user) && patient.campus_id !== req.user.campus_id) {
    return res.status(403).json({ error: 'Forbidden: Patient belongs to another campus' });
  }

  const { name, phone, email, id_no, unit, level, sex, birth } = req.body;
  db.prepare(`
    UPDATE patients
    SET name = COALESCE(?, name),
        phone = COALESCE(?, phone),
        email = COALESCE(?, email),
        id_no = COALESCE(?, id_no),
        unit = COALESCE(?, unit),
        level = COALESCE(?, level),
        sex = COALESCE(?, sex),
        birth = COALESCE(?, birth)
    WHERE id = ?;
  `).run(name, phone, email, id_no, unit, level, sex, birth, id);

  res.json({ message: 'Patient updated successfully' });
});

// DELETE /api/patients/:id
app.delete('/api/patients/:id', authenticate, requireRole('staff'), (req, res) => {
  const { id } = req.params;
  const patient = db.prepare('SELECT * FROM patients WHERE id = ?;').get(id);
  if (!patient) return res.status(404).json({ error: 'Patient not found' });

  if (!isMainStaff(req.user) && patient.campus_id !== req.user.campus_id) {
    return res.status(403).json({ error: 'Forbidden: Patient belongs to another campus' });
  }

  db.exec('BEGIN TRANSACTION;');
  db.prepare('DELETE FROM users WHERE patient_id = ?;').run(id);
  db.prepare('DELETE FROM dental_histories WHERE patient_id = ?;').run(id);
  db.prepare('DELETE FROM history_logs WHERE patient_id = ?;').run(id);
  db.prepare('DELETE FROM exams WHERE patient_id = ?;').run(id);
  db.prepare('DELETE FROM appointments WHERE patient_id = ?;').run(id);
  db.prepare('DELETE FROM visits WHERE patient_id = ?;').run(id);
  db.prepare('DELETE FROM prescriptions WHERE patient_id = ?;').run(id);
  db.prepare('DELETE FROM referrals WHERE patient_id = ?;').run(id);
  db.prepare('DELETE FROM patients WHERE id = ?;').run(id);
  db.exec('COMMIT;');

  res.json({ message: 'Patient deleted successfully' });
});

// PUT /api/patients/:id/history
app.put('/api/patients/:id/history', authenticate, (req, res) => {
  const { id } = req.params;
  const patient = db.prepare('SELECT * FROM patients WHERE id = ?;').get(id);
  if (!patient) return res.status(404).json({ error: 'Patient not found' });

  if (req.user.role === 'patient' && req.user.patient_id !== id) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const { conditions, allergies, medications, past_treatment } = req.body;
  const existing = db.prepare('SELECT * FROM dental_histories WHERE patient_id = ?;').get(id);

  const oldConds = existing ? JSON.parse(existing.conditions || '[]').join(', ') || 'None' : 'None';
  const newConds = (conditions || []).join(', ') || 'None';
  const oldAll = existing ? (existing.allergies || 'None') : 'None';
  const newAll = allergies || 'None';
  const oldMed = existing ? (existing.medications || 'None') : 'None';
  const newMed = medications || 'None';
  const oldPast = existing ? JSON.parse(existing.past_treatment || '[]').join(', ') || 'None' : 'None';
  const newPast = (past_treatment || []).join(', ') || 'None';

  const ts = nowStr();
  const byName = req.user.role === 'patient' ? `${req.user.name} (patient)` : req.user.name;
  const isDentistReview = req.user.role === 'dentist';

  db.exec('BEGIN TRANSACTION;');

  const stmtLog = db.prepare(`
    INSERT INTO history_logs (id, patient_id, ts, by_name, field, from_val, to_val, seen)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?);
  `);

  if (oldConds !== newConds) stmtLog.run(nid('h'), id, ts, byName, 'Medical conditions', oldConds, newConds, isDentistReview ? 1 : 0);
  if (oldAll !== newAll) stmtLog.run(nid('h'), id, ts, byName, 'Allergies', oldAll, newAll, isDentistReview ? 1 : 0);
  if (oldMed !== newMed) stmtLog.run(nid('h'), id, ts, byName, 'Current medications', oldMed, newMed, isDentistReview ? 1 : 0);
  if (oldPast !== newPast) stmtLog.run(nid('h'), id, ts, byName, 'Past dental treatment', oldPast, newPast, isDentistReview ? 1 : 0);

  db.prepare(`
    INSERT INTO dental_histories (patient_id, conditions, allergies, medications, past_treatment, updated_at, reviewed, reviewed_by, reviewed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(patient_id) DO UPDATE SET
      conditions = excluded.conditions,
      allergies = excluded.allergies,
      medications = excluded.medications,
      past_treatment = excluded.past_treatment,
      updated_at = excluded.updated_at,
      reviewed = excluded.reviewed,
      reviewed_by = excluded.reviewed_by,
      reviewed_at = excluded.reviewed_at;
  `).run(
    id,
    JSON.stringify(conditions || []),
    allergies || 'None',
    medications || 'None',
    JSON.stringify(past_treatment || []),
    todayStr(),
    isDentistReview ? 1 : 0,
    isDentistReview ? req.user.name : (existing ? existing.reviewed_by : null),
    isDentistReview ? todayStr() : (existing ? existing.reviewed_at : null)
  );

  db.exec('COMMIT;');
  res.json({ message: 'Dental history saved successfully' });
});

// POST /api/patients/:id/review (Dentist marks reviewed)
app.post('/api/patients/:id/review', authenticate, requireRole('dentist'), (req, res) => {
  const { id } = req.params;
  db.exec('BEGIN TRANSACTION;');
  db.prepare('UPDATE history_logs SET seen = 1 WHERE patient_id = ?;').run(id);
  db.prepare(`
    UPDATE dental_histories
    SET reviewed = 1, reviewed_by = ?, reviewed_at = ?
    WHERE patient_id = ?;
  `).run(req.user.name, todayStr(), id);
  db.exec('COMMIT;');
  res.json({ message: 'Marked dental history as reviewed' });
});

/* =========================================================================
   DENTAL EXAMS & TOOTH CHART API
   ========================================================================= */

// POST /api/exams
app.post('/api/exams', authenticate, requireRole('dentist'), (req, res) => {
  const { patient_id, teeth, gum, findings, needs, remarks, date } = req.body;
  if (!patient_id) return res.status(400).json({ error: 'Patient ID is required' });

  const id = nid('e');
  const examDate = date || todayStr();

  db.prepare(`
    INSERT INTO exams (id, patient_id, date, by_name, teeth_json, gum, findings, needs, remarks, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
  `).run(id, patient_id, examDate, req.user.name, JSON.stringify(teeth || {}), gum || 'Healthy', findings || '', needs || '', remarks || '', nowStr());

  res.status(201).json({ message: 'Dental examination saved', id });
});

/* =========================================================================
   APPOINTMENTS API
   ========================================================================= */

// GET /api/appointments
app.get('/api/appointments', authenticate, (req, res) => {
  const { status, campus, patient_id } = req.query;
  let sql = `
    SELECT a.*, p.name as patient_name, p.type as patient_type, p.phone as patient_phone, c.name as campus_name
    FROM appointments a
    JOIN patients p ON a.patient_id = p.id
    JOIN campuses c ON a.campus_id = c.id
    WHERE 1=1
  `;
  const params = [];

  if (req.user.role === 'patient') {
    sql += ' AND a.patient_id = ?';
    params.push(req.user.patient_id);
  } else {
    const targetCampus = (isMainStaff(req.user) && campus) ? (campus === 'all' ? null : campus) : req.user.campus_id;
    if (targetCampus) {
      sql += ' AND a.campus_id = ?';
      params.push(targetCampus);
    }
    if (patient_id) {
      sql += ' AND a.patient_id = ?';
      params.push(patient_id);
    }
  }

  if (status && status !== 'all') {
    sql += ' AND a.status = ?';
    params.push(status);
  }

  sql += ' ORDER BY a.date DESC, a.time DESC;';
  const appointments = db.prepare(sql).all(...params);
  res.json({ appointments });
});

// GET /api/appointments/slots
app.get('/api/appointments/slots', authenticate, (req, res) => {
  const campus_id = req.query.campus || req.user.campus_id;
  const closed = db.prepare('SELECT date, time FROM closed_slots WHERE campus_id = ?;').all(campus_id);
  const taken = db.prepare(`
    SELECT date, time FROM appointments
    WHERE campus_id = ? AND status IN ('Pending', 'Approved');
  `).all(campus_id);

  res.json({ closed, taken });
});

// POST /api/appointments
app.post('/api/appointments', authenticate, (req, res) => {
  const { patient_id, campus_id, date, time, reason } = req.body;
  const targetPatient = req.user.role === 'patient' ? req.user.patient_id : patient_id;
  const targetCampus = req.user.role === 'patient' ? req.user.campus_id : (campus_id || req.user.campus_id);

  if (!targetPatient || !date || !time) {
    return res.status(400).json({ error: 'Date, time, and patient are required' });
  }

  // Check if slot is closed
  const isClosed = db.prepare('SELECT id FROM closed_slots WHERE campus_id = ? AND date = ? AND time = ?;').get(targetCampus, date, time);
  if (isClosed) {
    return res.status(400).json({ error: 'This time slot is closed by the clinic.' });
  }

  // Check if slot taken
  const isTaken = db.prepare(`
    SELECT id FROM appointments
    WHERE campus_id = ? AND date = ? AND time = ? AND status IN ('Pending', 'Approved');
  `).get(targetCampus, date, time);
  if (isTaken) {
    return res.status(400).json({ error: 'This time slot has already been requested or booked.' });
  }

  const id = nid('a');
  db.prepare(`
    INSERT INTO appointments (id, patient_id, campus_id, date, time, reason, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 'Pending', ?);
  `).run(id, targetPatient, targetCampus, date, time, reason || '', nowStr());

  // Notify staff
  const pat = db.prepare('SELECT name FROM patients WHERE id = ?;').get(targetPatient);
  db.prepare(`
    INSERT INTO notifications (id, recipient, date, text, email, is_read, created_at)
    VALUES (?, ?, ?, ?, 'Clinic Staff', 0, ?);
  `).run(nid('nt'), 'staff:' + targetCampus, todayStr(), `New appointment request from ${pat ? pat.name : 'a patient'} for ${date} at ${time}.`, nowStr());

  res.status(201).json({ message: 'Appointment requested successfully', id });
});

// PUT /api/appointments/:id/status
app.put('/api/appointments/:id/status', authenticate, requireRole('staff', 'dentist'), (req, res) => {
  const { id } = req.params;
  const { status, reason, notes } = req.body;
  if (!status) return res.status(400).json({ error: 'Status is required' });

  const appt = db.prepare('SELECT * FROM appointments WHERE id = ?;').get(id);
  if (!appt) return res.status(404).json({ error: 'Appointment not found' });

  const reviewerName = req.user.name || 'Clinic Management';
  const actionTime = nowStr();
  const noteText = notes || reason || null;

  try {
    db.prepare(`
      UPDATE appointments 
      SET status = ?, 
          notes = COALESCE(?, notes),
          approved_by = ?,
          approved_at = ?
      WHERE id = ?;
    `).run(status, noteText, reviewerName, actionTime, id);
  } catch (_) {
    db.prepare('UPDATE appointments SET status = ? WHERE id = ?;').run(status, id);
  }

  // Notify patient
  const pat = db.prepare('SELECT email FROM patients WHERE id = ?;').get(appt.patient_id);
  let notifText = `Your appointment on ${appt.date} at ${appt.time} was marked as ${status} by ${reviewerName}.`;
  if (status === 'Declined' && (reason || notes)) notifText += ` Reason: ${reason || notes}`;
  db.prepare(`
    INSERT INTO notifications (id, recipient, date, text, email, is_read, created_at)
    VALUES (?, ?, ?, ?, ?, 0, ?);
  `).run(nid('nt'), 'patient:' + appt.patient_id, todayStr(), notifText, pat ? pat.email : '', nowStr());

  res.json({ message: `Appointment ${status.toLowerCase()} successfully`, approved_by: reviewerName });
});

// PUT /api/appointments/:id/reschedule
app.put('/api/appointments/:id/reschedule', authenticate, (req, res) => {
  const { id } = req.params;
  const { date, time, reason } = req.body;

  const appt = db.prepare('SELECT * FROM appointments WHERE id = ?;').get(id);
  if (!appt) return res.status(404).json({ error: 'Appointment not found' });

  if (req.user.role === 'patient' && appt.patient_id !== req.user.patient_id) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  // Check if slot taken
  const isTaken = db.prepare(`
    SELECT id FROM appointments
    WHERE id != ? AND campus_id = ? AND date = ? AND time = ? AND status IN ('Pending', 'Approved');
  `).get(id, appt.campus_id, date, time);
  if (isTaken) {
    return res.status(400).json({ error: 'This time slot is already taken' });
  }

  const newStatus = req.user.role === 'patient' ? 'Pending' : 'Approved';
  db.prepare(`
    UPDATE appointments
    SET date = ?, time = ?, reason = COALESCE(?, reason), status = ?
    WHERE id = ?;
  `).run(date, time, reason, newStatus, id);

  res.json({ message: 'Appointment rescheduled successfully' });
});

// DELETE /api/appointments/:id
app.delete('/api/appointments/:id', authenticate, (req, res) => {
  const { id } = req.params;
  const appt = db.prepare('SELECT * FROM appointments WHERE id = ?;').get(id);
  if (!appt) return res.status(404).json({ error: 'Appointment not found' });

  if (req.user.role === 'patient' && appt.patient_id !== req.user.patient_id) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  db.prepare("UPDATE appointments SET status = 'Cancelled' WHERE id = ?;").run(id);
  res.json({ message: 'Appointment cancelled' });
});

// POST /api/appointments/slots/toggle (Staff open/close slot)
app.post('/api/appointments/slots/toggle', authenticate, requireRole('staff'), (req, res) => {
  const { date, time } = req.body;
  const campus = req.user.campus_id;
  const existing = db.prepare('SELECT id FROM closed_slots WHERE campus_id = ? AND date = ? AND time = ?;').get(campus, date, time);
  if (existing) {
    db.prepare('DELETE FROM closed_slots WHERE id = ?;').run(existing.id);
    res.json({ closed: false, message: 'Time slot reopened' });
  } else {
    db.prepare('INSERT INTO closed_slots (id, campus_id, date, time) VALUES (?, ?, ?, ?);').run(nid('cs'), campus, date, time);
    res.json({ closed: true, message: 'Time slot closed' });
  }
});

/* =========================================================================
   VISITS API
   ========================================================================= */

// Helper: check if visit is first-time for school year
function isFirstTimeVisit(patientId, campusId, visitDate) {
  const sy = db.prepare('SELECT * FROM school_years WHERE is_active = 1 LIMIT 1;').get();
  if (!sy) return false;
  if (visitDate < sy.start_date || visitDate > sy.end_date) return false;

  const earlierVisit = db.prepare(`
    SELECT id FROM visits
    WHERE patient_id = ? AND campus_id = ? AND date >= ? AND date < ?
    LIMIT 1;
  `).get(patientId, campusId, sy.start_date, visitDate);

  return !earlierVisit;
}

// GET /api/visits
app.get('/api/visits', authenticate, (req, res) => {
  const { campus, patient_id, type, source, search } = req.query;
  let sql = `
    SELECT v.*, p.name as patient_name, p.type as patient_type, p.id_no as patient_id_no
    FROM visits v
    JOIN patients p ON v.patient_id = p.id
    WHERE 1=1
  `;
  const params = [];

  if (req.user.role === 'patient') {
    sql += ' AND v.patient_id = ?';
    params.push(req.user.patient_id);
  } else {
    const targetCampus = (isMainStaff(req.user) && campus) ? (campus === 'all' ? null : campus) : req.user.campus_id;
    if (targetCampus) {
      sql += ' AND v.campus_id = ?';
      params.push(targetCampus);
    }
    if (patient_id) {
      sql += ' AND v.patient_id = ?';
      params.push(patient_id);
    }
  }

  if (type && type !== 'all') {
    if (type === 'personnel') {
      sql += ' AND (p.type = ? OR p.type = ?)';
      params.push('personnel', 'faculty');
    } else {
      sql += ' AND p.type = ?';
      params.push(type);
    }
  }

  if (source && source !== 'all') {
    sql += ' AND v.source = ?';
    params.push(source);
  }

  if (search) {
    sql += ' AND (p.name LIKE ? OR p.id_no LIKE ? OR v.notes LIKE ? OR v.teeth LIKE ?)';
    const term = `%${search.trim()}%`;
    params.push(term, term, term, term);
  }

  sql += ' ORDER BY v.date DESC, v.created_at DESC;';
  const visits = db.prepare(sql).all(...params);

  const serviceMap = {};
  try {
    const allServices = db.prepare('SELECT id, name FROM services;').all();
    for (const s of allServices) {
      serviceMap[s.id] = s.name;
    }
  } catch (_) {}

  visits.forEach(v => {
    v.services = JSON.parse(v.services_json || '[]');
    v.service_names = v.services.map(sid => serviceMap[sid] || sid);
    v.is_first_time = isFirstTimeVisit(v.patient_id, v.campus_id, v.date);
  });
  res.json({ visits });
});

// POST /api/visits (Dentist and Staff record visit)
app.post('/api/visits', authenticate, requireRole('dentist', 'staff'), (req, res) => {
  const { patient_id, date, source, consult, services, teeth, notes, appointment_id, referral_to, referral_reason, dentist_name } = req.body;
  if (!patient_id) return res.status(400).json({ error: 'Patient is required' });

  const id = nid('v');
  const visitDate = date || todayStr();
  const attendingDentist = dentist_name || (req.user.role === 'dentist' ? req.user.name : 'Attending Dentist');

  db.exec('BEGIN TRANSACTION;');

  db.prepare(`
    INSERT INTO visits (id, patient_id, campus_id, date, source, consult, services_json, teeth, notes, dentist_name, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
  `).run(id, patient_id, req.user.campus_id, visitDate, source || 'Walk-in', consult ? 1 : 0, JSON.stringify(services || []), teeth || '', notes || '', attendingDentist, nowStr());

  if (appointment_id) {
    db.prepare("UPDATE appointments SET status = 'Completed' WHERE id = ?;").run(appointment_id);
  }

  // Create linked referral if provided
  let refId = null;
  if (referral_to && referral_reason) {
    refId = nid('rf');
    const datesObj = {};
    datesObj['Referred'] = visitDate;
    db.prepare(`
      INSERT INTO referrals (id, patient_id, visit_id, campus_id, referred_to, reason, created_by, status, dates_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'Referred', ?);
    `).run(refId, patient_id, id, req.user.campus_id, referral_to, referral_reason, req.user.name, JSON.stringify(datesObj));
  }

  db.exec('COMMIT;');
  res.status(201).json({ message: 'Visit recorded successfully', id, referral_id: refId });
});

// DELETE /api/visits/:id
app.delete('/api/visits/:id', authenticate, requireRole('dentist', 'staff'), (req, res) => {
  const { id } = req.params;
  db.prepare('DELETE FROM visits WHERE id = ?;').run(id);
  res.json({ message: 'Visit record removed' });
});

/* =========================================================================
   MEDICINES, PRESCRIPTIONS & INVENTORY
   ========================================================================= */

// GET /api/medicines
app.get('/api/medicines', authenticate, (req, res) => {
  const medicines = db.prepare('SELECT * FROM medicines ORDER BY name ASC;').all();
  medicines.forEach(m => {
    m.keys = JSON.parse(m.drug_keys_json || '[]');
    const stockRow = db.prepare('SELECT SUM(qty) as total FROM inventory_batches WHERE med_id = ? AND campus_id = ? AND qty > 0;').get(m.id, req.user.campus_id);
    m.stock_qty = stockRow && stockRow.total ? stockRow.total : 0;
  });
  res.json({ medicines });
});

// GET /api/prescriptions
app.get('/api/prescriptions', authenticate, (req, res) => {
  const { status, patient_id, campus } = req.query;
  let sql = `
    SELECT r.*, p.name as patient_name, m.name as medicine_name, m.unit as medicine_unit
    FROM prescriptions r
    JOIN patients p ON r.patient_id = p.id
    JOIN medicines m ON r.med_id = m.id
    WHERE 1=1
  `;
  const params = [];

  if (req.user.role === 'patient') {
    sql += ' AND r.patient_id = ?';
    params.push(req.user.patient_id);
  } else {
    const targetCampus = (isMainStaff(req.user) && campus) ? (campus === 'all' ? null : campus) : req.user.campus_id;
    if (targetCampus) {
      sql += ' AND r.campus_id = ?';
      params.push(targetCampus);
    }
    if (patient_id) {
      sql += ' AND r.patient_id = ?';
      params.push(patient_id);
    }
  }

  if (status && status !== 'all') {
    sql += ' AND r.status = ?';
    params.push(status);
  }

  sql += ' ORDER BY r.date DESC;';
  const prescriptions = db.prepare(sql).all(...params);
  res.json({ prescriptions });
});

// POST /api/prescriptions
app.post('/api/prescriptions', authenticate, requireRole('dentist'), (req, res) => {
  const { patient_id, med_id, dosage, qty, visit_id } = req.body;
  if (!patient_id || !med_id || !qty || qty < 1) {
    return res.status(400).json({ error: 'Patient, medicine, and positive quantity are required' });
  }

  const id = nid('rx');
  db.prepare(`
    INSERT INTO prescriptions (id, patient_id, visit_id, campus_id, med_id, dosage, qty, prescribed_by, date, status, dispensed_by, dispensed_on, dispensed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Prescribed', NULL, NULL, NULL);
  `).run(id, patient_id, visit_id || null, req.user.campus_id, med_id, dosage || 'As directed', qty, req.user.name, todayStr());

  res.status(201).json({ message: 'Prescription created successfully', id });
});

// POST /api/prescriptions/:id/dispense (FEFO batch deduction)
app.post('/api/prescriptions/:id/dispense', authenticate, requireRole('staff', 'dentist'), (req, res) => {
  const { id } = req.params;
  const rx = db.prepare('SELECT * FROM prescriptions WHERE id = ?;').get(id);
  if (!rx) return res.status(404).json({ error: 'Prescription not found' });
  if (rx.status === 'Dispensed') return res.status(400).json({ error: 'Prescription has already been dispensed' });

  // Batches sorted by expiry date ASC (FEFO: First Expired, First Out)
  const batches = db.prepare(`
    SELECT * FROM inventory_batches
    WHERE campus_id = ? AND med_id = ? AND qty > 0
    ORDER BY expiry ASC;
  `).all(rx.campus_id, rx.med_id);

  let remaining = rx.qty;
  const plan = [];

  for (const b of batches) {
    if (remaining <= 0) break;
    const take = Math.min(b.qty, remaining);
    plan.push({ batch: b, take });
    remaining -= take;
  }

  if (remaining > 0) {
    return res.status(400).json({ error: `Insufficient stock. Short by ${remaining} units.` });
  }

  const today = todayStr();
  const now = nowStr();

  db.exec('BEGIN TRANSACTION;');

  for (const item of plan) {
    db.prepare('UPDATE inventory_batches SET qty = qty - ? WHERE id = ?;').run(item.take, item.batch.id);
    db.prepare(`
      INSERT INTO inventory_ledger (id, date, campus_id, med_id, lot, type, qty, by_name, reason, created_at)
      VALUES (?, ?, ?, ?, ?, 'Dispensed', ?, ?, 'Prescription', ?);
    `).run(nid('l'), today, rx.campus_id, rx.med_id, item.batch.lot, -item.take, req.user.name, now);
  }

  db.prepare(`
    UPDATE prescriptions
    SET status = 'Dispensed', dispensed_by = ?, dispensed_on = ?, dispensed_at = ?
    WHERE id = ?;
  `).run(req.user.name, today, now, id);

  db.exec('COMMIT;');
  res.json({ message: 'Medicine dispensed and stock updated automatically', plan });
});

// DELETE /api/prescriptions/:id
app.delete('/api/prescriptions/:id', authenticate, requireRole('dentist', 'staff'), (req, res) => {
  const { id } = req.params;
  const rx = db.prepare('SELECT * FROM prescriptions WHERE id = ?;').get(id);
  if (!rx) return res.status(404).json({ error: 'Prescription not found' });
  if (rx.status === 'Dispensed') return res.status(400).json({ error: 'Cannot delete dispensed prescription' });

  db.prepare('DELETE FROM prescriptions WHERE id = ?;').run(id);
  res.json({ message: 'Prescription cancelled' });
});

// GET /api/inventory/stock
app.get('/api/inventory/stock', authenticate, requireRole('staff', 'dentist'), (req, res) => {
  const targetCampus = (isMainStaff(req.user) && req.query.campus) ? req.query.campus : req.user.campus_id;
  const medicines = db.prepare('SELECT * FROM medicines ORDER BY name ASC;').all();

  const stock = medicines.map(m => {
    let sql = 'SELECT * FROM inventory_batches WHERE med_id = ? AND qty > 0';
    const params = [m.id];
    if (targetCampus !== 'all') {
      sql += ' AND campus_id = ?';
      params.push(targetCampus);
    }
    sql += ' ORDER BY expiry ASC;';
    const batches = db.prepare(sql).all(...params);
    const totalQty = batches.reduce((sum, b) => sum + b.qty, 0);
    const nearest = batches[0];
    return {
      medicine: m,
      total_qty: totalQty,
      nearest_expiry: nearest ? nearest.expiry : null,
      batch_count: batches.length
    };
  });

  res.json({ stock });
});

// GET /api/inventory/batches
app.get('/api/inventory/batches', authenticate, requireRole('staff', 'dentist'), (req, res) => {
  const targetCampus = (isMainStaff(req.user) && req.query.campus) ? req.query.campus : req.user.campus_id;
  let sql = `
    SELECT b.*, m.name as medicine_name, m.unit as medicine_unit
    FROM inventory_batches b
    JOIN medicines m ON b.med_id = m.id
    WHERE b.qty > 0
  `;
  const params = [];
  if (targetCampus !== 'all') {
    sql += ' AND b.campus_id = ?';
    params.push(targetCampus);
  }
  sql += ' ORDER BY b.expiry ASC;';
  const batches = db.prepare(sql).all(...params);
  res.json({ batches });
});

// POST /api/inventory/stock-in
app.post('/api/inventory/stock-in', authenticate, requireRole('staff'), (req, res) => {
  const { med_id, lot, expiry, qty, campus_id } = req.body;
  if (!med_id || !lot || !expiry || !qty || qty < 1) {
    return res.status(400).json({ error: 'Medicine, lot, expiry date, and quantity are required' });
  }

  const campus = (isMainStaff(req.user) && campus_id) ? campus_id : req.user.campus_id;
  const today = todayStr();

  db.exec('BEGIN TRANSACTION;');

  const existing = db.prepare('SELECT * FROM inventory_batches WHERE campus_id = ? AND med_id = ? AND lot = ? AND expiry = ?;').get(campus, med_id, lot, expiry);
  if (existing) {
    db.prepare('UPDATE inventory_batches SET qty = qty + ? WHERE id = ?;').run(qty, existing.id);
  } else {
    db.prepare(`
      INSERT INTO inventory_batches (id, campus_id, med_id, lot, expiry, qty)
      VALUES (?, ?, ?, ?, ?, ?);
    `).run(nid('b'), campus, med_id, lot, expiry, qty);
  }

  db.prepare(`
    INSERT INTO inventory_ledger (id, date, campus_id, med_id, lot, type, qty, by_name, reason, created_at)
    VALUES (?, ?, ?, ?, ?, 'Stock-in', ?, ?, 'Delivery', ?);
  `).run(nid('l'), today, campus, med_id, lot, qty, req.user.name, nowStr());

  db.exec('COMMIT;');
  res.status(201).json({ message: 'Stock added successfully' });
});

// POST /api/inventory/correction
app.post('/api/inventory/correction', authenticate, requireRole('staff'), (req, res) => {
  const { batch_id, delta_qty, reason } = req.body;
  if (!batch_id || delta_qty === undefined || delta_qty === 0) {
    return res.status(400).json({ error: 'Batch ID and non-zero quantity change are required' });
  }

  const batch = db.prepare('SELECT * FROM inventory_batches WHERE id = ?;').get(batch_id);
  if (!batch) return res.status(404).json({ error: 'Batch not found' });

  if (batch.qty + delta_qty < 0) {
    return res.status(400).json({ error: 'Correction would result in negative stock quantity' });
  }

  db.exec('BEGIN TRANSACTION;');
  db.prepare('UPDATE inventory_batches SET qty = qty + ? WHERE id = ?;').run(delta_qty, batch_id);
  db.prepare(`
    INSERT INTO inventory_ledger (id, date, campus_id, med_id, lot, type, qty, by_name, reason, created_at)
    VALUES (?, ?, ?, ?, ?, 'Correction', ?, ?, ?, ?);
  `).run(nid('l'), todayStr(), batch.campus_id, batch.med_id, batch.lot, delta_qty, req.user.name, reason || 'Count adjustment', nowStr());
  db.exec('COMMIT;');

  res.json({ message: 'Correction recorded successfully' });
});

// GET /api/inventory/ledger
app.get('/api/inventory/ledger', authenticate, requireRole('staff', 'dentist'), (req, res) => {
  const targetCampus = (isMainStaff(req.user) && req.query.campus) ? req.query.campus : req.user.campus_id;
  let sql = `
    SELECT l.*, m.name as medicine_name
    FROM inventory_ledger l
    JOIN medicines m ON l.med_id = m.id
    WHERE 1=1
  `;
  const params = [];
  if (targetCampus !== 'all') {
    sql += ' AND l.campus_id = ?';
    params.push(targetCampus);
  }
  sql += ' ORDER BY l.created_at DESC LIMIT 100;';
  const ledger = db.prepare(sql).all(...params);
  res.json({ ledger });
});

/* =========================================================================
   REFERRALS API
   ========================================================================= */

// GET /api/referrals
app.get('/api/referrals', authenticate, (req, res) => {
  const { status, campus, patient_id } = req.query;
  let sql = `
    SELECT r.*, p.name as patient_name, p.type as patient_type
    FROM referrals r
    JOIN patients p ON r.patient_id = p.id
    WHERE 1=1
  `;
  const params = [];

  if (req.user.role === 'patient') {
    sql += ' AND r.patient_id = ?';
    params.push(req.user.patient_id);
  } else {
    const targetCampus = (isMainStaff(req.user) && campus) ? (campus === 'all' ? null : campus) : req.user.campus_id;
    if (targetCampus) {
      sql += ' AND r.campus_id = ?';
      params.push(targetCampus);
    }
    if (patient_id) {
      sql += ' AND r.patient_id = ?';
      params.push(patient_id);
    }
  }

  if (status && status !== 'all') {
    sql += ' AND r.status = ?';
    params.push(status);
  }

  sql += ' ORDER BY r.id DESC;';
  const referrals = db.prepare(sql).all(...params);
  referrals.forEach(r => { r.dates = JSON.parse(r.dates_json || '{}'); });
  res.json({ referrals });
});

// POST /api/referrals (Dentist create referral)
app.post('/api/referrals', authenticate, requireRole('dentist'), (req, res) => {
  const { patient_id, visit_id, referred_to, reason } = req.body;
  if (!patient_id || !referred_to || !reason) {
    return res.status(400).json({ error: 'Patient, facility destination, and reason are required' });
  }

  const id = nid('rf');
  const dates = { Referred: todayStr() };

  db.prepare(`
    INSERT INTO referrals (id, patient_id, visit_id, campus_id, referred_to, reason, created_by, status, dates_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'Referred', ?);
  `).run(id, patient_id, visit_id || null, req.user.campus_id, referred_to, reason, req.user.name, JSON.stringify(dates));

  res.status(201).json({ message: 'Referral created successfully', id });
});

// PUT /api/referrals/:id/stage (Staff progress referral stage)
app.put('/api/referrals/:id/stage', authenticate, requireRole('staff'), (req, res) => {
  const { id } = req.params;
  const { status, date } = req.body;
  if (!status) return res.status(400).json({ error: 'New status is required' });

  const ref = db.prepare('SELECT * FROM referrals WHERE id = ?;').get(id);
  if (!ref) return res.status(404).json({ error: 'Referral not found' });

  const dates = JSON.parse(ref.dates_json || '{}');
  dates[status] = date || todayStr();

  db.prepare(`
    UPDATE referrals
    SET status = ?, dates_json = ?
    WHERE id = ?;
  `).run(status, JSON.stringify(dates), id);

  res.json({ message: `Referral status updated to ${status}` });
});

// DELETE /api/referrals/:id
app.delete('/api/referrals/:id', authenticate, requireRole('dentist', 'staff'), (req, res) => {
  const { id } = req.params;
  db.prepare('DELETE FROM referrals WHERE id = ?;').run(id);
  res.json({ message: 'Referral removed' });
});

/* =========================================================================
   ANNOUNCEMENTS & NOTIFICATIONS API
   ========================================================================= */

// GET /api/announcements
app.get('/api/announcements', (req, res) => {
  const announcements = db.prepare('SELECT * FROM announcements ORDER BY date DESC, created_at DESC;').all();
  res.json({ announcements });
});

// POST /api/announcements
app.post('/api/announcements', authenticate, requireRole('staff'), (req, res) => {
  const { title, body } = req.body;
  if (!title || !body) return res.status(400).json({ error: 'Title and body are required' });

  const id = nid('an');
  const today = todayStr();

  db.exec('BEGIN TRANSACTION;');
  db.prepare(`
    INSERT INTO announcements (id, title, body, by_name, campus_id, date, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?);
  `).run(id, title, body, req.user.name, req.user.campus_id, today, nowStr());

  // Broadcast to all active patient notifications
  const patients = db.prepare('SELECT id, email FROM patients;').all();
  const stmtNotif = db.prepare(`
    INSERT INTO notifications (id, recipient, date, text, email, is_read, created_at)
    VALUES (?, ?, ?, ?, ?, 0, ?);
  `);
  for (const p of patients) {
    stmtNotif.run(nid('nt'), 'patient:' + p.id, today, `New Announcement: ${title}`, p.email, nowStr());
  }

  db.exec('COMMIT;');
  res.status(201).json({ message: 'Announcement posted successfully', id });
});

// DELETE /api/announcements/:id
app.delete('/api/announcements/:id', authenticate, requireRole('staff'), (req, res) => {
  const { id } = req.params;
  db.prepare('DELETE FROM announcements WHERE id = ?;').run(id);
  res.json({ message: 'Announcement deleted' });
});

// GET /api/notifications
app.get('/api/notifications', authenticate, (req, res) => {
  const recipient = req.user.role === 'patient' ? 'patient:' + req.user.patient_id : 'staff:' + req.user.campus_id;
  const notifications = db.prepare('SELECT * FROM notifications WHERE recipient = ? ORDER BY created_at DESC LIMIT 50;').all(recipient);
  res.json({ notifications });
});

// POST /api/notifications/mark-read
app.post('/api/notifications/mark-read', authenticate, (req, res) => {
  const recipient = req.user.role === 'patient' ? 'patient:' + req.user.patient_id : 'staff:' + req.user.campus_id;
  db.prepare('UPDATE notifications SET is_read = 1 WHERE recipient = ?;').run(recipient);
  res.json({ message: 'Notifications marked as read' });
});

/* =========================================================================
   REPORTS API
   ========================================================================= */

// GET /api/reports/monthly
app.get('/api/reports/monthly', authenticate, requireRole('staff', 'dentist'), (req, res) => {
  const { month, campus } = req.query;
  const targetMonth = month || todayStr().slice(0, 7);
  let campusesToReport = [req.user.campus_id];

  if (isMainStaff(req.user)) {
    if (campus && campus !== 'all') {
      campusesToReport = [campus];
    } else {
      campusesToReport = db.prepare('SELECT id FROM campuses;').all().map(c => c.id);
    }
  }

  const reports = {};

  for (const cid of campusesToReport) {
    const visits = db.prepare(`
      SELECT * FROM visits
      WHERE campus_id = ? AND strftime('%Y-%m', date) = ?;
    `).all(cid, targetMonth);

    let consultations = 0, exams = 0, extractions = 0, procedures = 0;
    let emergencyWalkins = 0, routineWalkins = 0, apptVisits = 0;
    const patientIds = new Set();
    const byType = { student: 0, faculty: 0, personnel: 0 };
    let firstTime = 0, returning = 0;

    const servicesByType = {
      student: { consultations: 0, exams: 0, extractions: 0, procedures: 0, referrals: 0, total: 0 },
      personnel: { consultations: 0, exams: 0, extractions: 0, procedures: 0, referrals: 0, total: 0 },
      all: { consultations: 0, exams: 0, extractions: 0, procedures: 0, referrals: 0, total: 0 }
    };

    for (const v of visits) {
      const p = db.prepare('SELECT type FROM patients WHERE id = ?;').get(v.patient_id);
      const cat = (p && p.type === 'student') ? 'student' : 'personnel';

      if (v.source === 'Emergency Walk-in') emergencyWalkins++;
      else if (v.source === 'Appointment') apptVisits++;
      else routineWalkins++;

      if (v.consult) {
        consultations++;
        servicesByType[cat].consultations++;
        servicesByType[cat].total++;
        servicesByType.all.consultations++;
        servicesByType.all.total++;
      }

      patientIds.add(v.patient_id);
      const svcs = JSON.parse(v.services_json || '[]');
      for (const sid of svcs) {
        const s = db.prepare('SELECT category FROM services WHERE id = ?;').get(sid);
        if (s) {
          if (s.category === 'Oral examination') {
            exams++;
            servicesByType[cat].exams++;
            servicesByType[cat].total++;
            servicesByType.all.exams++;
            servicesByType.all.total++;
          } else if (s.category === 'Extraction') {
            extractions++;
            servicesByType[cat].extractions++;
            servicesByType[cat].total++;
            servicesByType.all.extractions++;
            servicesByType.all.total++;
          } else if (s.category === 'Referral') {
            servicesByType[cat].referrals++;
            servicesByType[cat].total++;
            servicesByType.all.referrals++;
            servicesByType.all.total++;
          } else {
            procedures++;
            servicesByType[cat].procedures++;
            servicesByType[cat].total++;
            servicesByType.all.procedures++;
            servicesByType.all.total++;
          }
        }
      }
    }

    // Monthly referrals count
    const monthReferrals = db.prepare(`
      SELECT r.*, p.type as patient_type
      FROM referrals r
      JOIN patients p ON r.patient_id = p.id
      WHERE r.campus_id = ? AND json_extract(r.dates_json, '$.Referred') LIKE ?;
    `).all(cid, `${targetMonth}%`);

    let totalReferrals = monthReferrals.length;
    for (const r of monthReferrals) {
      const cat = (r.patient_type === 'student') ? 'student' : 'personnel';
      // Only increment if not already counted via services
      if (servicesByType[cat].referrals === 0) {
        servicesByType[cat].referrals++;
        servicesByType[cat].total++;
        servicesByType.all.referrals++;
        servicesByType.all.total++;
      }
    }

    for (const pid of patientIds) {
      const p = db.prepare('SELECT type FROM patients WHERE id = ?;').get(pid);
      if (p && byType[p.type] !== undefined) byType[p.type]++;
      // Check first-time in month
      const firstVisit = db.prepare(`
        SELECT date FROM visits
        WHERE patient_id = ? AND campus_id = ?
        ORDER BY date ASC LIMIT 1;
      `).get(pid, cid);

      if (firstVisit && firstVisit.date.startsWith(targetMonth)) {
        firstTime++;
      } else {
        returning++;
      }
    }

    const rxDispensed = db.prepare(`
      SELECT COUNT(*) as count, SUM(qty) as total_qty
      FROM prescriptions
      WHERE campus_id = ? AND status = 'Dispensed' AND strftime('%Y-%m', dispensed_on) = ?;
    `).get(cid, targetMonth);

    reports[cid] = {
      visits_count: visits.length,
      emergency_walkins: emergencyWalkins,
      routine_walkins: routineWalkins,
      appointment_visits: apptVisits,
      consultations,
      exams,
      extractions,
      procedures,
      referrals: totalReferrals,
      services_by_type: servicesByType,
      patients_served: patientIds.size,
      first_time: firstTime,
      returning,
      by_type: byType,
      medicines_dispensed_records: rxDispensed ? rxDispensed.count : 0,
      medicines_dispensed_qty: rxDispensed && rxDispensed.total_qty ? rxDispensed.total_qty : 0
    };
  }

  res.json({ month: targetMonth, reports });
});

// GET /api/reports/referrals
app.get('/api/reports/referrals', authenticate, requireRole('staff', 'dentist'), (req, res) => {
  const campuses = db.prepare('SELECT * FROM campuses;').all();
  const stages = ['Referred', 'Contacted', 'Availed', 'Completed', 'Pending'];
  const summary = campuses.map(c => {
    const counts = {};
    for (const s of stages) {
      const row = db.prepare('SELECT COUNT(*) as count FROM referrals WHERE campus_id = ? AND status = ?;').get(c.id, s);
      counts[s] = row ? row.count : 0;
    }
    const total = db.prepare('SELECT COUNT(*) as count FROM referrals WHERE campus_id = ?;').get(c.id);
    return {
      campus: c,
      counts,
      total: total ? total.count : 0
    };
  });
  res.json({ summary });
});

/* =========================================================================
   SYSTEM SETUP API (Main Campus Staff only)
   ========================================================================= */

// GET /api/setup/accounts
app.get('/api/setup/accounts', authenticate, (req, res) => {
  if (!isMainStaff(req.user)) return res.status(403).json({ error: 'Main campus staff only' });
  const accounts = db.prepare(`
    SELECT u.id, u.username, u.name, u.role, u.campus_id, u.active, c.name as campus_name
    FROM users u
    JOIN campuses c ON u.campus_id = c.id
    WHERE u.role IN ('staff', 'dentist')
    ORDER BY u.campus_id, u.name;
  `).all();
  res.json({ accounts });
});

// POST /api/setup/accounts
app.post('/api/setup/accounts', authenticate, (req, res) => {
  if (!isMainStaff(req.user)) return res.status(403).json({ error: 'Main campus staff only' });
  const { name, username, role, campus_id, password } = req.body;
  if (!name || !username || !role || !campus_id) {
    return res.status(400).json({ error: 'Name, username, role, and campus are required' });
  }

  const existing = db.prepare('SELECT id FROM users WHERE username = ?;').get(username.trim().toLowerCase());
  if (existing) return res.status(400).json({ error: 'Username already taken' });

  const { salt, hash } = hashPassword(password || 'password123');
  const id = nid('u');

  db.prepare(`
    INSERT INTO users (id, username, password_hash, salt, name, role, campus_id, active, patient_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1, NULL, ?);
  `).run(id, username.trim().toLowerCase(), hash, salt, name, role, campus_id, nowStr());

  res.status(201).json({ message: 'Account created successfully', id });
});

// PUT /api/setup/accounts/:id/toggle
app.put('/api/setup/accounts/:id/toggle', authenticate, (req, res) => {
  if (!isMainStaff(req.user)) return res.status(403).json({ error: 'Main campus staff only' });
  const { id } = req.params;
  const user = db.prepare('SELECT active FROM users WHERE id = ?;').get(id);
  if (!user) return res.status(404).json({ error: 'Account not found' });

  const newStatus = user.active ? 0 : 1;
  db.prepare('UPDATE users SET active = ? WHERE id = ?;').run(newStatus, id);
  res.json({ active: newStatus, message: newStatus ? 'Account activated' : 'Account deactivated' });
});

// DELETE /api/setup/accounts/:id
app.delete('/api/setup/accounts/:id', authenticate, (req, res) => {
  if (!isMainStaff(req.user)) return res.status(403).json({ error: 'Main campus staff only' });
  const { id } = req.params;
  db.prepare('DELETE FROM users WHERE id = ?;').run(id);
  res.json({ message: 'Account deleted' });
});

// GET /api/setup/services
app.get('/api/setup/services', authenticate, (req, res) => {
  const services = db.prepare('SELECT * FROM services ORDER BY category, name;').all();
  res.json({ services });
});

// POST /api/setup/services
app.post('/api/setup/services', authenticate, (req, res) => {
  if (!isMainStaff(req.user)) return res.status(403).json({ error: 'Main campus staff only' });
  const { name, category, description } = req.body;
  if (!name || !category) return res.status(400).json({ error: 'Name and category are required' });

  const id = nid('s');
  db.prepare('INSERT INTO services (id, name, category, active, description) VALUES (?, ?, ?, 1, ?);').run(id, name, category, description || '');
  res.status(201).json({ message: 'Service added successfully', id });
});

// PUT /api/setup/services/:id/toggle
app.put('/api/setup/services/:id/toggle', authenticate, (req, res) => {
  if (!isMainStaff(req.user)) return res.status(403).json({ error: 'Main campus staff only' });
  const { id } = req.params;
  const svc = db.prepare('SELECT active FROM services WHERE id = ?;').get(id);
  if (!svc) return res.status(404).json({ error: 'Service not found' });

  const newStatus = svc.active ? 0 : 1;
  db.prepare('UPDATE services SET active = ? WHERE id = ?;').run(newStatus, id);
  res.json({ active: newStatus, message: newStatus ? 'Service shown' : 'Service hidden' });
});

// POST /api/setup/medicines
app.post('/api/setup/medicines', authenticate, (req, res) => {
  if (!isMainStaff(req.user)) return res.status(403).json({ error: 'Main campus staff only' });
  const { name, unit, keys } = req.body;
  if (!name || !unit) return res.status(400).json({ error: 'Name and unit are required' });

  const id = nid('m');
  const drugKeys = Array.isArray(keys) ? keys : [name.toLowerCase().split(' ')[0]];
  db.prepare('INSERT INTO medicines (id, name, unit, drug_keys_json) VALUES (?, ?, ?, ?);').run(id, name, unit, JSON.stringify(drugKeys));
  res.status(201).json({ message: 'Medicine added successfully', id });
});

// POST /api/setup/school-year
app.post('/api/setup/school-year', authenticate, (req, res) => {
  if (!isMainStaff(req.user)) return res.status(403).json({ error: 'Main campus staff only' });
  const { label, start_date, end_date } = req.body;
  if (!label || !start_date || !end_date) return res.status(400).json({ error: 'Label, start_date, and end_date are required' });

  db.exec('BEGIN TRANSACTION;');
  db.prepare('UPDATE school_years SET is_active = 0;').run();
  db.prepare('INSERT INTO school_years (id, label, start_date, end_date, is_active) VALUES (?, ?, ?, ?, 1);').run(nid('sy'), label, start_date, end_date);
  db.exec('COMMIT;');
  res.json({ message: 'Active school year updated' });
});

function startServer() {
  return app.listen(PORT, () => {
    console.log(`\n======================================================`);
    console.log(`🦷 University Dental Clinic Management System`);
    console.log(`======================================================`);
    console.log(`Server running at:    http://localhost:${PORT}`);
    console.log(`Open in your browser: http://localhost:${PORT}`);
    console.log(`Demo credentials:     See README.md or 1-click Quick-Fill`);
    console.log(`Press Ctrl+C to stop the server.`);
    console.log(`======================================================\n`);
  });
}

if (require.main === module) {
  startServer();
}

module.exports = app;
module.exports.startServer = startServer;
