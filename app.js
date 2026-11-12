/* app.js — Route table wiring + bootstrap render() call */
/* ===== Route table and start-up ===== */
const IMPL = Object.assign({}, SCREENS);
const ROUTES = {
  home: { patient: IMPL.patHome, dentist: IMPL.dentHome, staff: IMPL.staffHome },
  appointments: { patient: IMPL.patAppts, staff: IMPL.appointments },
  book: { patient: IMPL.patBook },
  records: { patient: IMPL.patRecords },
  services: { patient: IMPL.patServices },
  announcements: { patient: IMPL.patAnn, staff: IMPL.annManage },
  notifications: { patient: IMPL.patNotifs },
  register: { patient: IMPL.register },
  patients: { dentist: IMPL.patients, staff: IMPL.patients },
  chart: { dentist: IMPL.chart, staff: IMPL.chart },
  visits: { dentist: IMPL.visits, staff: IMPL.visits },
  visit_new: { dentist: IMPL.visitNew, staff: IMPL.visitNew },
  referrals: { dentist: IMPL.referrals, staff: IMPL.referrals },
  reports: { staff: IMPL.reports },
  setup: { staff: IMPL.setup }
};
Object.keys(ROUTES).forEach(r => {
  SCREENS[r] = () => { const f = ROUTES[r][cur().role]; return f ? f() : '<div class="empty">This screen is not available for this role.</div>'; };
});
function afterRender() { if (UI.route === 'visit_new' && cur().role === 'dentist') visitChanged(); }
render();
