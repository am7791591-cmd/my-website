const state = {
  data: null,
  view: "overview",
  role: "admin",
  selectedTeacherId: "t-1",
  selectedClassId: "c-1",
  attendanceDraft: {}
};

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];

function money(value) {
  return new Intl.NumberFormat("en-PK", {
    style: "currency",
    currency: "PKR",
    maximumFractionDigits: 0
  }).format(value);
}

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  window.setTimeout(() => toast.classList.remove("show"), 2600);
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "Request failed");
  return payload;
}

async function loadDashboard() {
  state.data = await api("/api/dashboard");
  render();
}

function teacherName(id) {
  return state.data.teachers.find(item => item.id === id)?.name || "Unassigned";
}

function className(id) {
  return state.data.classes.find(item => item.id === id)?.name || "No class";
}

function studentName(id) {
  return state.data.students.find(item => item.id === id)?.name || "Unknown student";
}

function studentsForClass(classId) {
  return state.data.students.filter(student => student.classId === classId);
}

function setView(view) {
  state.view = view;
  $$(".nav-item").forEach(button => button.classList.toggle("active", button.dataset.view === view));
  $$(".view").forEach(section => section.classList.remove("active"));
  $(`#${view}View`).classList.add("active");

  const titles = {
    overview: "Organization Dashboard",
    manage: "Organization Management",
    teacher: "Teacher Portal",
    fees: "Fee Portal",
    records: "Teacher and Student Records"
  };
  $("#pageTitle").textContent = titles[view];
}

function roleAllows(view) {
  if (state.role === "admin") return true;
  if (state.role === "teacher") return ["overview", "teacher", "records"].includes(view);
  if (state.role === "student") return ["overview", "records"].includes(view);
  return false;
}

function applyRole() {
  const hints = {
    admin: "Organization can add teachers, students, classes, and fee records.",
    teacher: "Teacher can view assigned classes, students, and attendance records.",
    student: "Student can view class, teacher, and basic record information."
  };
  $("#roleHint").textContent = hints[state.role];

  $$(".nav-item").forEach(button => {
    button.disabled = !roleAllows(button.dataset.view);
    button.style.opacity = button.disabled ? "0.45" : "1";
  });

  if (!roleAllows(state.view)) setView("overview");

  const adminOnly = state.role === "admin";
  ["#beginClassBtn", "#saveAttendanceBtn"].forEach(selector => {
    const button = $(selector);
    if (button) button.disabled = !adminOnly;
  });
  $$(".payment-cell input, .payment-cell button").forEach(item => {
    item.disabled = !adminOnly || item.disabled;
  });
}

function renderStats() {
  const stats = [
    ["Students", state.data.stats.students],
    ["Teachers", state.data.stats.teachers],
    ["Classes", state.data.stats.classes],
    ["Present Today", state.data.stats.presentToday],
    ["Active Sessions", state.data.sessions.filter(item => item.status === "active").length],
    ["Branch", state.data.organization.city]
  ];

  if (state.role === "admin") {
    stats.splice(3, 0, ["Fee Collected", money(state.data.stats.collected)], ["Total Due", money(state.data.stats.totalDue)]);
  }

  $("#statsGrid").innerHTML = stats.map(([label, value]) => `
    <article class="stat-card">
      <span>${label}</span>
      <strong>${value}</strong>
    </article>
  `).join("");
}

function renderOverview() {
  $("#classList").innerHTML = state.data.classes.map(item => `
    <article class="record">
      <div class="record-line">
        <strong>${item.name}</strong>
        <span>${item.time}</span>
      </div>
      <div class="record-line">
        <span>${teacherName(item.teacherId)}</span>
        <span>${item.room}</span>
      </div>
    </article>
  `).join("");

  if (state.role !== "admin") {
    $("#feeSummary").innerHTML = `
      <article class="record">
        <strong>Fee records are managed by organization only.</strong>
        <span class="meta">Teacher and student access is view-only without fee controls.</span>
      </article>
    `;
    return;
  }

  $("#feeSummary").innerHTML = state.data.fees.map(fee => {
    const due = fee.amount - fee.paid;
    return `
      <article class="record">
        <div class="record-line">
          <strong>${studentName(fee.studentId)}</strong>
          <span class="badge ${fee.status}">${fee.status}</span>
        </div>
        <div class="record-line">
          <span>${fee.month}</span>
          <span>Due: ${money(due)}</span>
        </div>
      </article>
    `;
  }).join("");
}

function renderTeacherControls() {
  $("#teacherSelect").innerHTML = state.data.teachers.map(teacher => `
    <option value="${teacher.id}" ${teacher.id === state.selectedTeacherId ? "selected" : ""}>${teacher.name}</option>
  `).join("");

  const teacherClasses = state.data.classes.filter(item => item.teacherId === state.selectedTeacherId);
  if (!teacherClasses.some(item => item.id === state.selectedClassId)) {
    state.selectedClassId = teacherClasses[0]?.id || state.data.classes[0]?.id;
  }

  $("#classSelect").innerHTML = teacherClasses.map(item => `
    <option value="${item.id}" ${item.id === state.selectedClassId ? "selected" : ""}>${item.name}</option>
  `).join("");

  $("#activeClassLabel").textContent = className(state.selectedClassId);
  $("#teacherSelect").disabled = state.role !== "admin";
  $("#classSelect").disabled = state.role !== "admin";
  $("#topicInput").disabled = state.role !== "admin";
}

function statusFor(personId, classId) {
  const date = new Date().toISOString().slice(0, 10);
  const existing = state.data.attendance.find(item => item.date === date && item.personId === personId && item.classId === classId);
  return state.attendanceDraft[personId] || existing?.status || "present";
}

function renderAttendance() {
  const students = studentsForClass(state.selectedClassId);
  $("#attendanceList").innerHTML = students.map(student => {
    const current = statusFor(student.id, state.selectedClassId);
    return `
      <article class="attendance-row" data-person-id="${student.id}">
        <div>
          <strong>${student.name}</strong>
          <div class="meta">Roll ${student.rollNo} - ${student.guardian}</div>
        </div>
        <div class="segmented" role="group" aria-label="Attendance for ${student.name}">
          ${["present", "late", "absent"].map(status => `
            <button type="button" data-status="${status}" class="${current === status ? "active" : ""}" ${state.role === "admin" ? "" : "disabled"}>${status}</button>
          `).join("")}
        </div>
      </article>
    `;
  }).join("") || `<p class="meta">No students assigned to this class yet.</p>`;

  $("#teacherAttendance").innerHTML = state.data.attendance
    .filter(item => item.personType === "teacher" && item.personId === state.selectedTeacherId)
    .slice(-6)
    .reverse()
    .map(item => `
      <article class="record">
        <div class="record-line">
          <strong>${item.date}</strong>
          <span class="badge ${item.status}">${item.status}</span>
        </div>
        <span class="meta">${className(item.classId)}</span>
      </article>
    `).join("") || `<p class="meta">No teacher attendance marked yet.</p>`;
}

function renderFees() {
  const query = $("#feeSearch").value.trim().toLowerCase();
  const rows = state.data.fees.filter(fee => {
    const student = studentName(fee.studentId).toLowerCase();
    return !query || student.includes(query) || fee.month.toLowerCase().includes(query);
  });

  $("#feeTable").innerHTML = rows.map(fee => {
    const due = fee.amount - fee.paid;
    return `
      <tr>
        <td><strong>${studentName(fee.studentId)}</strong><div class="meta">${className(state.data.students.find(item => item.id === fee.studentId)?.classId)}</div></td>
        <td>${fee.month}</td>
        <td>${money(fee.amount)}</td>
        <td>${money(fee.paid)}</td>
        <td>${money(due)}</td>
        <td><span class="badge ${fee.status}">${fee.status}</span></td>
        <td>
          <div class="payment-cell">
            <input type="number" min="1" max="${due}" placeholder="Amount" data-fee-input="${fee.id}">
            <button type="button" data-pay="${fee.id}" ${due <= 0 || state.role !== "admin" ? "disabled" : ""}>Add</button>
          </div>
        </td>
      </tr>
    `;
  }).join("");
}

function renderRecords() {
  $("#teacherRecords").innerHTML = state.data.teachers.map(teacher => `
    <article class="record">
      <div class="record-line">
        <strong>${teacher.name}</strong>
        <span class="badge">${teacher.status}</span>
      </div>
      <div class="record-line">
        <span>${teacher.subject}</span>
        <span>${teacher.phone}</span>
      </div>
    </article>
  `).join("");

  $("#studentRecords").innerHTML = state.data.students.map(student => `
    <article class="record">
      <div class="record-line">
        <strong>${student.name}</strong>
        <span>${student.rollNo}</span>
      </div>
      <div class="record-line">
        <span>${className(student.classId)}</span>
        <span>${student.guardian}</span>
      </div>
    </article>
  `).join("");
}

function renderManageOptions() {
  $("#manageClassTeacher").innerHTML = state.data.teachers.map(teacher => `
    <option value="${teacher.id}">${teacher.name} - ${teacher.subject}</option>
  `).join("");

  $("#manageStudentClass").innerHTML = state.data.classes.map(item => `
    <option value="${item.id}">${item.name}</option>
  `).join("");

  $("#manageFeeStudent").innerHTML = state.data.students.map(student => `
    <option value="${student.id}">${student.name} - ${student.rollNo}</option>
  `).join("");
}

function render() {
  if (!state.data) return;
  $("#todayBadge").textContent = new Date().toLocaleDateString("en-PK", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
  applyRole();
  renderStats();
  renderOverview();
  renderTeacherControls();
  renderAttendance();
  renderFees();
  renderRecords();
  renderManageOptions();
}

async function beginClass() {
  if (state.role !== "admin") {
    showToast("Only organization can start or manage class sessions");
    return;
  }
  const session = await api("/api/classes/begin", {
    method: "POST",
    body: JSON.stringify({
      teacherId: state.selectedTeacherId,
      classId: state.selectedClassId,
      topic: $("#topicInput").value.trim()
    })
  });
  await loadDashboard();
  showToast(`Class started: ${session.topic}`);
}

async function saveAttendance() {
  if (state.role !== "admin") {
    showToast("Only organization can save attendance");
    return;
  }
  const date = new Date().toISOString().slice(0, 10);
  const teacherStatus = statusFor(state.selectedTeacherId, state.selectedClassId);
  const studentRecords = studentsForClass(state.selectedClassId).map(student => ({
    date,
    personId: student.id,
    personType: "student",
    classId: state.selectedClassId,
    status: statusFor(student.id, state.selectedClassId),
    markedBy: state.selectedTeacherId
  }));

  await api("/api/attendance", {
    method: "POST",
    body: JSON.stringify({
      records: [
        {
          date,
          personId: state.selectedTeacherId,
          personType: "teacher",
          classId: state.selectedClassId,
          status: teacherStatus,
          markedBy: state.selectedTeacherId
        },
        ...studentRecords
      ]
    })
  });

  state.attendanceDraft = {};
  await loadDashboard();
  showToast("Attendance saved successfully");
}

async function addPayment(feeId) {
  if (state.role !== "admin") {
    showToast("Only organization can manage fees");
    return;
  }
  const input = document.querySelector(`[data-fee-input="${feeId}"]`);
  const amount = Number(input.value);
  await api("/api/fees/payment", {
    method: "POST",
    body: JSON.stringify({ feeId, amount, receivedBy: state.role })
  });
  input.value = "";
  await loadDashboard();
  showToast("Payment recorded");
}

function formData(form) {
  return Object.fromEntries(new FormData(form).entries());
}

async function submitAdminForm(event, path) {
  event.preventDefault();
  if (state.role !== "admin") {
    showToast("Only organization can add this data");
    return;
  }

  const form = event.currentTarget;
  await api(path, {
    method: "POST",
    body: JSON.stringify(formData(form))
  });
  form.reset();
  await loadDashboard();
  showToast("Record added by organization");
}

document.addEventListener("click", event => {
  const nav = event.target.closest(".nav-item");
  if (nav && !nav.disabled) setView(nav.dataset.view);

  const attendanceButton = event.target.closest(".attendance-row .segmented button");
  if (attendanceButton && state.role === "admin") {
    const row = attendanceButton.closest(".attendance-row");
    state.attendanceDraft[row.dataset.personId] = attendanceButton.dataset.status;
    renderAttendance();
  }

  const payButton = event.target.closest("[data-pay]");
  if (payButton && !payButton.disabled) {
    addPayment(payButton.dataset.pay).catch(error => showToast(error.message));
  }
});

$("#roleSelect").addEventListener("change", event => {
  state.role = event.target.value;
  if (state.role === "admin") setView("manage");
  if (state.role === "teacher") setView("teacher");
  if (state.role === "student") setView("records");
  render();
});

$("#teacherSelect").addEventListener("change", event => {
  state.selectedTeacherId = event.target.value;
  state.attendanceDraft = {};
  render();
});

$("#classSelect").addEventListener("change", event => {
  state.selectedClassId = event.target.value;
  state.attendanceDraft = {};
  render();
});

$("#beginClassBtn").addEventListener("click", () => beginClass().catch(error => showToast(error.message)));
$("#saveAttendanceBtn").addEventListener("click", () => saveAttendance().catch(error => showToast(error.message)));
$("#teacherForm").addEventListener("submit", event => submitAdminForm(event, "/api/teachers").catch(error => showToast(error.message)));
$("#classForm").addEventListener("submit", event => submitAdminForm(event, "/api/classes").catch(error => showToast(error.message)));
$("#studentForm").addEventListener("submit", event => submitAdminForm(event, "/api/students").catch(error => showToast(error.message)));
$("#newFeeForm").addEventListener("submit", event => submitAdminForm(event, "/api/fees").catch(error => showToast(error.message)));
$("#refreshBtn").addEventListener("click", () => loadDashboard().then(() => showToast("Data refreshed")));
$("#feeSearch").addEventListener("input", renderFees);
$("#clearFeeSearch").addEventListener("click", () => {
  $("#feeSearch").value = "";
  renderFees();
});

loadDashboard().catch(error => showToast(error.message));
