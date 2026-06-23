const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, "public");
const DB_FILE = path.join(ROOT, "data", "db.json");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml"
};

function readDb() {
  return JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
}

function writeDb(db) {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

function sendJson(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(payload));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", chunk => {
      body += chunk;
      if (body.length > 1_000_000) {
        reject(new Error("Request body too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
  });
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function slugId(prefix) {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

function required(body, fields) {
  const missing = fields.filter(field => !String(body[field] || "").trim());
  return missing.length ? `${missing.join(", ")} required` : "";
}

function dashboardPayload(db) {
  const totalDue = db.fees.reduce((sum, fee) => sum + Math.max(fee.amount - fee.paid, 0), 0);
  const collected = db.fees.reduce((sum, fee) => sum + fee.paid, 0);
  const presentToday = db.attendance.filter(item => item.date === today() && item.status === "present").length;

  return {
    organization: db.organization,
    stats: {
      students: db.students.length,
      teachers: db.teachers.length,
      classes: db.classes.length,
      collected,
      totalDue,
      presentToday
    },
    teachers: db.teachers,
    students: db.students,
    classes: db.classes,
    fees: db.fees,
    attendance: db.attendance,
    sessions: db.sessions
  };
}

async function handleApi(req, res, pathname) {
  const db = readDb();

  if (req.method === "GET" && pathname === "/api/dashboard") {
    return sendJson(res, 200, dashboardPayload(db));
  }

  if (req.method === "POST" && pathname === "/api/login") {
    const body = await readBody(req);
    const user = db.users.find(item => item.email === body.email && item.password === body.password);
    if (!user) return sendJson(res, 401, { error: "Invalid email or password" });
    return sendJson(res, 200, {
      id: user.id,
      name: user.name,
      role: user.role,
      teacherId: user.teacherId || null
    });
  }

  if (req.method === "POST" && pathname === "/api/classes/begin") {
    const body = await readBody(req);
    const classItem = db.classes.find(item => item.id === body.classId);
    const teacher = db.teachers.find(item => item.id === body.teacherId);
    if (!classItem || !teacher) return sendJson(res, 400, { error: "Class or teacher not found" });

    const session = {
      id: crypto.randomUUID(),
      classId: classItem.id,
      teacherId: teacher.id,
      startedAt: new Date().toISOString(),
      status: "active",
      topic: body.topic || "Regular lesson"
    };
    db.sessions.unshift(session);
    writeDb(db);
    return sendJson(res, 201, session);
  }

  if (req.method === "POST" && pathname === "/api/teachers") {
    const body = await readBody(req);
    const error = required(body, ["name", "subject", "phone"]);
    if (error) return sendJson(res, 400, { error });

    const teacher = {
      id: slugId("t"),
      name: body.name.trim(),
      subject: body.subject.trim(),
      phone: body.phone.trim(),
      status: "active"
    };
    db.teachers.push(teacher);
    writeDb(db);
    return sendJson(res, 201, teacher);
  }

  if (req.method === "POST" && pathname === "/api/classes") {
    const body = await readBody(req);
    const error = required(body, ["name", "teacherId", "room", "time"]);
    if (error) return sendJson(res, 400, { error });
    if (!db.teachers.some(item => item.id === body.teacherId)) {
      return sendJson(res, 400, { error: "Teacher not found" });
    }

    const classItem = {
      id: slugId("c"),
      name: body.name.trim(),
      teacherId: body.teacherId,
      room: body.room.trim(),
      time: body.time.trim()
    };
    db.classes.push(classItem);
    writeDb(db);
    return sendJson(res, 201, classItem);
  }

  if (req.method === "POST" && pathname === "/api/students") {
    const body = await readBody(req);
    const error = required(body, ["name", "guardian", "phone", "classId", "rollNo"]);
    if (error) return sendJson(res, 400, { error });
    if (!db.classes.some(item => item.id === body.classId)) {
      return sendJson(res, 400, { error: "Class not found" });
    }

    const student = {
      id: slugId("s"),
      name: body.name.trim(),
      guardian: body.guardian.trim(),
      phone: body.phone.trim(),
      classId: body.classId,
      rollNo: body.rollNo.trim(),
      status: "active"
    };
    db.students.push(student);
    writeDb(db);
    return sendJson(res, 201, student);
  }

  if (req.method === "POST" && pathname === "/api/fees") {
    const body = await readBody(req);
    const error = required(body, ["studentId", "month", "amount"]);
    if (error) return sendJson(res, 400, { error });
    if (!db.students.some(item => item.id === body.studentId)) {
      return sendJson(res, 400, { error: "Student not found" });
    }

    const amount = Number(body.amount);
    const paid = Number(body.paid || 0);
    if (!Number.isFinite(amount) || amount <= 0) return sendJson(res, 400, { error: "Valid amount is required" });
    if (!Number.isFinite(paid) || paid < 0) return sendJson(res, 400, { error: "Valid paid amount is required" });

    const fee = {
      id: slugId("f"),
      studentId: body.studentId,
      month: body.month.trim(),
      amount,
      paid: Math.min(amount, paid),
      status: paid >= amount ? "paid" : paid > 0 ? "partial" : "due",
      lastPaymentDate: paid > 0 ? today() : "",
      receipts: paid > 0 ? [{
        id: slugId("r"),
        amount: Math.min(amount, paid),
        date: today(),
        receivedBy: "organization"
      }] : []
    };
    db.fees.push(fee);
    writeDb(db);
    return sendJson(res, 201, fee);
  }

  if (req.method === "POST" && pathname === "/api/attendance") {
    const body = await readBody(req);
    if (!Array.isArray(body.records)) return sendJson(res, 400, { error: "records array is required" });

    body.records.forEach(record => {
      const existing = db.attendance.find(item =>
        item.date === record.date &&
        item.personId === record.personId &&
        item.classId === record.classId
      );
      const nextRecord = {
        id: existing ? existing.id : crypto.randomUUID(),
        date: record.date || today(),
        personId: record.personId,
        personType: record.personType,
        classId: record.classId,
        status: record.status,
        markedBy: record.markedBy
      };

      if (existing) Object.assign(existing, nextRecord);
      else db.attendance.push(nextRecord);
    });

    writeDb(db);
    return sendJson(res, 200, { ok: true, attendance: db.attendance });
  }

  if (req.method === "POST" && pathname === "/api/fees/payment") {
    const body = await readBody(req);
    const fee = db.fees.find(item => item.id === body.feeId);
    if (!fee) return sendJson(res, 404, { error: "Fee record not found" });

    const amount = Number(body.amount || 0);
    if (!Number.isFinite(amount) || amount <= 0) return sendJson(res, 400, { error: "Valid amount is required" });

    fee.paid = Math.min(fee.amount, fee.paid + amount);
    fee.lastPaymentDate = today();
    fee.status = fee.paid >= fee.amount ? "paid" : "partial";
    fee.receipts.unshift({
      id: crypto.randomUUID(),
      amount,
      date: today(),
      receivedBy: body.receivedBy || "organization"
    });

    writeDb(db);
    return sendJson(res, 200, fee);
  }

  return sendJson(res, 404, { error: "API route not found" });
}

function serveStatic(req, res, pathname) {
  const requestedPath = pathname === "/" ? "/index.html" : pathname;
  const filePath = path.normalize(path.join(PUBLIC_DIR, requestedPath));

  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end("Forbidden");
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      return res.end("Not found");
    }

    const type = MIME_TYPES[path.extname(filePath)] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": type });
    res.end(content);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (url.pathname.startsWith("/api/")) {
      await handleApi(req, res, url.pathname);
      return;
    }
    serveStatic(req, res, url.pathname);
  } catch (error) {
    sendJson(res, 500, { error: error.message || "Server error" });
  }
});
server.listen(PORT, () => {
  console.log(`Madani Education Portal running at http://localhost:${PORT}`);
});
module.exports = server;
