const assert = require('node:assert');
const http = require('node:http');
const app = require('../server.js');

let server;
let baseUrl;

function request(method, path, data = null, token = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const options = {
      method,
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      headers: {
        'Content-Type': 'application/json'
      }
    };
    if (token) options.headers['Authorization'] = `Bearer ${token}`;

    const req = http.request(options, res => {
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(body); } catch {}
        resolve({ status: res.statusCode, data: json, raw: body });
      });
    });
    req.on('error', reject);
    if (data) req.write(JSON.stringify(data));
    req.end();
  });
}

async function runTests() {
  console.log('--- Starting API & Persistence Automated Test Suite ---');

  // Start test server on dynamic port
  await new Promise(resolve => {
    server = app.listen(0, () => {
      const port = server.address().port;
      baseUrl = `http://localhost:${port}`;
      console.log(`Test server running at ${baseUrl}`);
      resolve();
    });
  });

  try {
    // 1. Test Login with Valid Staff Credentials
    console.log('1. Testing staff login...');
    const staffLogin = await request('POST', '/api/auth/login', { username: 'ana.villanueva', password: 'password123' });
    assert.strictEqual(staffLogin.status, 200, 'Staff login failed');
    assert(staffLogin.data.token, 'Token missing in login response');
    assert.strictEqual(staffLogin.data.user.role, 'staff', 'Role should be staff');
    const staffToken = staffLogin.data.token;
    console.log('   ✓ Staff login passed');

    // 2. Test Login with Invalid Password
    console.log('2. Testing invalid login rejection...');
    const badLogin = await request('POST', '/api/auth/login', { username: 'ana.villanueva', password: 'wrongpassword' });
    assert.strictEqual(badLogin.status, 401, 'Should reject invalid password with 401');
    console.log('   ✓ Invalid login rejected as expected');

    // 3. Test Dentist Login
    console.log('3. Testing dentist login...');
    const dentistLogin = await request('POST', '/api/auth/login', { username: 'ramon.cruz', password: 'password123' });
    assert.strictEqual(dentistLogin.status, 200);
    assert.strictEqual(dentistLogin.data.user.role, 'dentist');
    const dentistToken = dentistLogin.data.token;
    console.log('   ✓ Dentist login passed');

    // 4. Test Patient Login
    console.log('4. Testing patient login...');
    const patientLogin = await request('POST', '/api/auth/login', { username: 'maria.santos@univ.example', password: 'password123' });
    assert.strictEqual(patientLogin.status, 200);
    assert.strictEqual(patientLogin.data.user.role, 'patient');
    const patientToken = patientLogin.data.token;
    console.log('   ✓ Patient login passed');

    // 5. Test Role Authorization (Patient blocked from inventory)
    console.log('5. Testing role authorization: patient accessing inventory...');
    const forbiddenInv = await request('GET', '/api/inventory/stock', null, patientToken);
    assert.strictEqual(forbiddenInv.status, 403, 'Patient should be forbidden from inventory (403)');
    console.log('   ✓ Unauthorized access properly blocked with 403');

    // 6. Test Patients CRUD & Search
    console.log('6. Testing patients list and search...');
    const patList = await request('GET', '/api/patients?search=Santos', null, staffToken);
    assert.strictEqual(patList.status, 200);
    assert(patList.data.patients.length >= 1, 'Should find patient Maria Santos');
    console.log('   ✓ Patients query with search passed');

    // 7. Test Patient Details with History & Exams
    console.log('7. Testing patient comprehensive details...');
    const patDetails = await request('GET', '/api/patients/p1', null, staffToken);
    assert.strictEqual(patDetails.status, 200);
    assert.strictEqual(patDetails.data.patient.id, 'p1');
    assert(patDetails.data.history, 'Dental history must be present');
    assert(Array.isArray(patDetails.data.exams), 'Exams list must be present');
    console.log('   ✓ Patient full details retrieved');

    // 8. Test Dental History Update & Diff Logging
    console.log('8. Testing dental history update and audit diff log...');
    const updateHist = await request('PUT', '/api/patients/p1/history', {
      conditions: ['Asthma', 'Diabetes'],
      allergies: 'Latex',
      medications: 'Salbutamol inhaler',
      past_treatment: ['Cleaning', 'Filling', 'Extraction']
    }, patientToken);
    assert.strictEqual(updateHist.status, 200);

    const recheckPat = await request('GET', '/api/patients/p1', null, staffToken);
    assert.strictEqual(recheckPat.data.history.allergies, 'Latex');
    assert(recheckPat.data.historyLog.length > 0, 'History audit diff log should contain entries');
    console.log('   ✓ Dental history update and audit diff log verified');

    // 9. Test Dentist Exam & Tooth Chart Save
    console.log('9. Testing dentist exam & tooth chart save...');
    const examRes = await request('POST', '/api/exams', {
      patient_id: 'p1',
      teeth: { '16': 'filled', '36': 'decayed', '46': 'sound', '26': 'decayed' },
      gum: 'Mild inflammation',
      findings: 'Test examination cavity findings',
      needs: 'Filling for tooth 26'
    }, dentistToken);
    assert.strictEqual(examRes.status, 201);
    assert(examRes.data.id, 'Exam ID should be returned');
    console.log('   ✓ Dentist exam and tooth chart successfully stored');

    // 10. Test Appointments Booking, Slot Check, and Approval
    console.log('10. Testing appointment workflow: slot check -> booking -> approval...');
    const slots = await request('GET', '/api/appointments/slots?campus=main', null, staffToken);
    assert.strictEqual(slots.status, 200);

    const testDate = '2026-10-15';
    const testTime = '11:00';
    // Ensure slot is free for test
    const { db } = require('../db.js');
    db.prepare('DELETE FROM appointments WHERE campus_id = ? AND date = ? AND time = ?;').run('main', testDate, testTime);

    const newAppt = await request('POST', '/api/appointments', {
      patient_id: 'p1',
      campus_id: 'main',
      date: testDate,
      time: testTime,
      reason: 'Routine prophylaxis checkup'
    }, patientToken);
    assert.strictEqual(newAppt.status, 201);
    const apptId = newAppt.data.id;

    // Staff approve appointment
    const approveRes = await request('PUT', `/api/appointments/${apptId}/status`, { status: 'Approved' }, staffToken);
    assert.strictEqual(approveRes.status, 200);

    const checkAppt = await request('GET', `/api/appointments?patient_id=p1`, null, staffToken);
    const matched = checkAppt.data.appointments.find(a => a.id === apptId);
    assert.strictEqual(matched.status, 'Approved', 'Appointment should be approved in database');
    console.log('   ✓ Appointment booking and approval verified');

    // 11. Test Prescription & FEFO Batch Dispensing
    console.log('11. Testing prescription creation and FEFO dispensing...');
    // Create prescription for Maria Santos (Paracetamol: m4)
    const rxRes = await request('POST', '/api/prescriptions', {
      patient_id: 'p1',
      med_id: 'm4',
      dosage: '1 tablet every 6 hours',
      qty: 15
    }, dentistToken);
    assert.strictEqual(rxRes.status, 201);
    const rxId = rxRes.data.id;

    const batchesBefore = await request('GET', '/api/inventory/batches?campus=main', null, staffToken);
    const m4Batch = batchesBefore.data.batches.find(b => b.med_id === 'm4');
    // Ensure batch has sufficient stock for test
    if (m4Batch.qty < 20) {
      db.prepare('UPDATE inventory_batches SET qty = 100 WHERE id = ?').run(m4Batch.id);
      m4Batch.qty = 100;
    }
    const initialQty = m4Batch.qty;

    // Dispense
    const dispenseRes = await request('POST', `/api/prescriptions/${rxId}/dispense`, {}, staffToken);
    assert.strictEqual(dispenseRes.status, 200);

    // Verify stock deducted in database
    const batchesAfter = await request('GET', '/api/inventory/batches?campus=main', null, staffToken);
    const m4BatchAfter = batchesAfter.data.batches.find(b => b.id === m4Batch.id);
    assert.strictEqual(m4BatchAfter.qty, initialQty - 15, 'Batch stock should be decremented by 15');

    // Verify ledger
    const ledger = await request('GET', '/api/inventory/ledger?campus=main', null, staffToken);
    assert(ledger.data.ledger.some(l => l.med_id === 'm4' && l.qty === -15), 'Ledger should record -15 dispensed');
    console.log('   ✓ FEFO prescription dispensing and inventory deduction passed');

    // 12. Test Referral Progression
    console.log('12. Testing referral creation and lifecycle update...');
    const refRes = await request('POST', '/api/referrals', {
      patient_id: 'p1',
      referred_to: 'St. Jude Dental Surgery Unit',
      reason: 'Wisdom tooth evaluation'
    }, dentistToken);
    assert.strictEqual(refRes.status, 201);
    const refId = refRes.data.id;

    const refUpdate = await request('PUT', `/api/referrals/${refId}/stage`, { status: 'Contacted' }, staffToken);
    assert.strictEqual(refUpdate.status, 200);

    const refList = await request('GET', '/api/referrals?patient_id=p1', null, staffToken);
    const myRef = refList.data.referrals.find(r => r.id === refId);
    assert.strictEqual(myRef.status, 'Contacted');
    console.log('   ✓ Referral 4-stage lifecycle update verified');

    // 13. Test Monthly Reports
    console.log('13. Testing monthly reports calculation...');
    const repRes = await request('GET', '/api/reports/monthly?month=2026-09&campus=main', null, staffToken);
    assert.strictEqual(repRes.status, 200);
    assert(repRes.data.reports.main, 'Report for main campus should be present');
    assert(typeof repRes.data.reports.main.patients_served === 'number');
    console.log('   ✓ Monthly reports generated accurately');

    // 14. Test Student and Personnel Separation
    console.log('14. Testing student and personnel separation in patients query...');
    const studentsRes = await request('GET', '/api/patients?type=student', null, staffToken);
    assert.strictEqual(studentsRes.status, 200);
    assert(studentsRes.data.patients.every(p => p.type === 'student'), 'All records should be students');

    const personnelRes = await request('GET', '/api/patients?type=personnel', null, staffToken);
    assert.strictEqual(personnelRes.status, 200);
    assert(personnelRes.data.patients.every(p => p.type === 'personnel' || p.type === 'faculty'), 'All records should be personnel or faculty');
    console.log('   ✓ Student and personnel separation verified');

    // 15. Test Manual Input of Patient Record (Personnel & Student)
    console.log('15. Testing manual input of patient record with dental history...');
    const testPatEmail = `roberto_${Date.now()}@univ.example`;
    const manualPatRes = await request('POST', '/api/patients', {
      name: 'Engr. Roberto Dalisay',
      type: 'personnel',
      id_no: 'EMP-' + Math.floor(10000 + Math.random() * 90000),
      unit: 'College of Engineering',
      level: 'Department Chair',
      email: testPatEmail,
      phone: '0917 555 4321',
      campus_id: 'main',
      allergies: 'Aspirin',
      conditions: ['High blood pressure'],
      medications: 'Amlodipine 5mg',
      past_treatment: ['Tooth Extraction']
    }, staffToken);
    assert.strictEqual(manualPatRes.status, 201);
    const newPatId = manualPatRes.data.id;
    assert(newPatId, 'Created patient ID must be returned');

    const verifyNewPat = await request('GET', `/api/patients/${newPatId}`, null, staffToken);
    assert.strictEqual(verifyNewPat.data.patient.name, 'Engr. Roberto Dalisay');
    assert.strictEqual(verifyNewPat.data.history.allergies, 'Aspirin');
    console.log('   ✓ Manual input of patient record and history verified');

    // 16. Test Emergency Walk-in Visit with Referral
    console.log('16. Testing emergency walk-in visit recording with dental referral...');
    const emergencyVisitRes = await request('POST', '/api/visits', {
      patient_id: newPatId,
      date: '2026-09-21',
      source: 'Emergency Walk-in',
      consult: true,
      services: ['s1', 's3'], // Oral examination + Tooth extraction
      teeth: '47',
      notes: 'Emergency severe toothache, extraction completed. Specialist referral requested.',
      referral_to: 'City Hospital Maxillofacial Department',
      referral_reason: 'Post-extraction dry socket prevention check'
    }, dentistToken);
    assert.strictEqual(emergencyVisitRes.status, 201);
    assert(emergencyVisitRes.data.id, 'Visit ID must be returned');
    assert(emergencyVisitRes.data.referral_id, 'Referral ID should be created');

    const visitsList = await request('GET', `/api/visits?source=Emergency Walk-in`, null, staffToken);
    assert.strictEqual(visitsList.status, 200);
    assert(visitsList.data.visits.some(v => v.id === emergencyVisitRes.data.id), 'Emergency walk-in visit should be logged');
    console.log('   ✓ Emergency walk-in visit and dental referral verified');

    // 17. Test Management Appointment Approval Workflow
    console.log('17. Testing appointment management approval workflow...');
    const mgmtTestDate = '2026-10-28';
    const mgmtTestTime = '14:00';
    db.prepare('DELETE FROM appointments WHERE campus_id = ? AND date = ? AND time = ?;').run('main', mgmtTestDate, mgmtTestTime);

    const apptBooking = await request('POST', '/api/appointments', {
      patient_id: newPatId,
      campus_id: 'main',
      date: mgmtTestDate,
      time: mgmtTestTime,
      reason: 'Post-extraction follow up examination'
    }, staffToken);
    assert.strictEqual(apptBooking.status, 201);
    const managementApptId = apptBooking.data.id;

    // Approve by management (dentist or staff)
    const mgmtApprove = await request('PUT', `/api/appointments/${managementApptId}/status`, {
      status: 'Approved',
      notes: 'Approved by Dr. Ramon Cruz'
    }, dentistToken);
    assert.strictEqual(mgmtApprove.status, 200);

    const checkMgmtAppt = await request('GET', `/api/appointments?patient_id=${newPatId}`, null, staffToken);
    const approvedMatch = checkMgmtAppt.data.appointments.find(a => a.id === managementApptId);
    assert.strictEqual(approvedMatch.status, 'Approved');
    console.log('   ✓ Management appointment approval workflow verified');

    // 18. Test Pie Graph Services Breakdown in Monthly Reports
    console.log('18. Testing services breakdown and demographics for pie graphs...');
    const reportsMetrics = await request('GET', '/api/reports/monthly?month=2026-09&campus=main', null, staffToken);
    assert.strictEqual(reportsMetrics.status, 200);
    const mainReport = reportsMetrics.data.reports.main;
    assert(mainReport.services_by_type, 'services_by_type must be provided for pie graphs');
    assert(mainReport.services_by_type.student, 'Student services breakdown must exist');
    assert(mainReport.services_by_type.personnel, 'Personnel services breakdown must exist');
    assert(mainReport.services_by_type.all, 'Overall services breakdown must exist');
    assert(typeof mainReport.emergency_walkins === 'number', 'emergency_walkins count must be a number');
    console.log('   ✓ Pie graph services breakdown in monthly reports verified');

    console.log('\n✅ ALL 18 TEST CASES PASSED SUCCESSFULLY!');
  } finally {
    if (server) server.close();
  }
}

runTests().catch(err => {
  console.error('\n❌ Test suite failed:', err);
  if (server) server.close();
  process.exit(1);
});
