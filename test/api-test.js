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

    // 5. Removed pharmacy and inventory APIs are no longer available
    console.log('5. Testing removed medicine and inventory APIs...');
    for (const [method, endpoint] of [
      ['GET', '/api/medicines'],
      ['GET', '/api/prescriptions'],
      ['GET', '/api/inventory/stock'],
      ['POST', '/api/setup/medicines']
    ]) {
      const response = await request(method, endpoint, method === 'POST' ? {} : null);
      assert.strictEqual(response.status, 404, `${method} ${endpoint} should not exist`);
    }
    console.log('   ✓ Removed medicine and inventory APIs return 404');

    // 6. Test Patients CRUD & Search
    console.log('6. Testing patients list and search...');
    const patList = await request('GET', '/api/patients?search=Santos', null, staffToken);
    assert.strictEqual(patList.status, 200);
    assert(patList.data.patients.length >= 1, 'Should find patient Maria Santos');
    for (const search of ['2024-01234', 'BS Nursing', '2nd year']) {
      const searchResult = await request('GET', `/api/patients?search=${encodeURIComponent(search)}`, null, staffToken);
      assert.strictEqual(searchResult.status, 200);
      assert(searchResult.data.patients.some(patient => patient.id === 'p1'), `Patient directory should find Maria by ${search}`);
    }
    const visitCourseSearch = await request('GET', '/api/visits?search=BS%20Nursing', null, staffToken);
    assert.strictEqual(visitCourseSearch.status, 200);
    assert(visitCourseSearch.data.visits.some(visit => visit.patient_id === 'p1'), 'Visits search should find a patient by course');
    const visitYearSearch = await request('GET', '/api/visits?search=2nd%20year', null, staffToken);
    assert.strictEqual(visitYearSearch.status, 200);
    assert(visitYearSearch.data.visits.some(visit => visit.patient_id === 'p1'), 'Visits search should find a patient by year level');
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

    // 11. Test Referral Progression
    console.log('11. Testing referral creation and lifecycle update...');
    const refRes = await request('POST', '/api/referrals', {
      patient_id: 'p1',
      referred_to: 'St. Jude Dental Surgery Unit',
      reason: 'Wisdom tooth evaluation'
    }, dentistToken);
    assert.strictEqual(refRes.status, 201);
    const refId = refRes.data.id;

    const refUpdate = await request('PUT', `/api/referrals/${refId}/stage`, { status: 'Contacted' }, staffToken);
    assert.strictEqual(refUpdate.status, 200);

    const refUpdateToCompleted = await request('PUT', `/api/referrals/${refId}/stage`, { status: 'Completed' }, staffToken);
    assert.strictEqual(refUpdateToCompleted.status, 200, 'Should allow selecting any referral stage');

    const refUpdateBackToReferred = await request('PUT', `/api/referrals/${refId}/stage`, { status: 'Referred' }, staffToken);
    assert.strictEqual(refUpdateBackToReferred.status, 200, 'Should allow returning to an earlier referral stage');

    const invalidRefStage = await request('PUT', `/api/referrals/${refId}/stage`, { status: 'Unknown' }, staffToken);
    assert.strictEqual(invalidRefStage.status, 400, 'Should reject invalid referral stages');

    const refList = await request('GET', '/api/referrals?patient_id=p1', null, staffToken);
    const myRef = refList.data.referrals.find(r => r.id === refId);
    assert.strictEqual(myRef.status, 'Referred');
    console.log('   ✓ Referral stages can be selected and invalid stages are rejected');

    // 12. Test Monthly Reports
    console.log('12. Testing monthly reports calculation...');
    const repRes = await request('GET', '/api/reports/monthly?month=2026-09&campus=main', null, staffToken);
    assert.strictEqual(repRes.status, 200);
    assert(repRes.data.reports.main, 'Report for main campus should be present');
    assert(typeof repRes.data.reports.main.patients_served === 'number');
    console.log('   ✓ Monthly reports generated accurately');

    // 13. Test Student and Personnel Separation
    console.log('13. Testing student and personnel separation in patients query...');
    const studentsRes = await request('GET', '/api/patients?type=student', null, staffToken);
    assert.strictEqual(studentsRes.status, 200);
    assert(studentsRes.data.patients.every(p => p.type === 'student'), 'All records should be students');

    const personnelRes = await request('GET', '/api/patients?type=personnel', null, staffToken);
    assert.strictEqual(personnelRes.status, 200);
    assert(personnelRes.data.patients.every(p => p.type === 'personnel' || p.type === 'faculty'), 'All records should be personnel or faculty');
    console.log('   ✓ Student and personnel separation verified');

    // 14. Test Manual Input of Patient Record (Personnel & Student)
    console.log('14. Testing manual input of patient record with dental history...');
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

    const editPatientRes = await request('PUT', `/api/patients/${newPatId}`, {
      name: 'Engr. Roberto Dalisay Updated',
      id_no: 'EMP-79616',
      email: testPatEmail,
      phone: '0917 555 4321',
      unit: 'College of Engineering',
      level: 'Department Chair'
    }, staffToken);
    assert.strictEqual(editPatientRes.status, 200, 'Patient details should save when optional sex and birth fields are omitted');

    const verifyNewPat = await request('GET', `/api/patients/${newPatId}`, null, staffToken);
    assert.strictEqual(verifyNewPat.data.patient.name, 'Engr. Roberto Dalisay Updated');
    assert.strictEqual(verifyNewPat.data.patient.sex, '', 'Omitted sex should remain unchanged');
    assert.strictEqual(verifyNewPat.data.patient.birth, '', 'Omitted birth should remain unchanged');
    assert.strictEqual(verifyNewPat.data.history.allergies, 'Aspirin');
    console.log('   ✓ Manual input and editing of patient details verified');

    // 15. Test Emergency Walk-in Visit with Referral
    console.log('15. Testing emergency walk-in visit recording with dental referral...');
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

    // 16. Test Management Appointment Approval Workflow
    console.log('16. Testing appointment management approval workflow...');
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

    // 17. Test Pie Graph Services Breakdown in Monthly Reports
    console.log('17. Testing services breakdown and demographics for pie graphs...');
    const reportsMetrics = await request('GET', '/api/reports/monthly?month=2026-09&campus=main', null, staffToken);
    assert.strictEqual(reportsMetrics.status, 200);
    const mainReport = reportsMetrics.data.reports.main;
    assert(mainReport.services_by_type, 'services_by_type must be provided for pie graphs');
    assert(mainReport.services_by_type.student, 'Student services breakdown must exist');
    assert(mainReport.services_by_type.personnel, 'Personnel services breakdown must exist');
    assert(mainReport.services_by_type.all, 'Overall services breakdown must exist');
    assert(typeof mainReport.emergency_walkins === 'number', 'emergency_walkins count must be a number');
    console.log('   ✓ Pie graph services breakdown in monthly reports verified');

    console.log('\n✅ ALL 17 TEST CASES PASSED SUCCESSFULLY!');
  } finally {
    if (server) server.close();
  }
}

runTests().catch(err => {
  console.error('\n❌ Test suite failed:', err);
  if (server) server.close();
  process.exit(1);
});
