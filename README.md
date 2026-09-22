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
