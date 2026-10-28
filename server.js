require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const root = __dirname;
const uploadRoot = path.join(root, 'public', 'uploads');
const uploadDirs = ['gallery', 'certificates', 'resumes'];
uploadDirs.forEach(dir => fs.mkdirSync(path.join(uploadRoot, dir), { recursive: true }));

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(root, 'public')));

const fileStorage = folder => multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, path.join(uploadRoot, folder)),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`);
  }
});
const galleryUpload = multer({ storage: fileStorage('gallery'), limits: { files: 10, fileSize: 10 * 1024 * 1024 } });
const certificateUpload = multer({ storage: fileStorage('certificates'), limits: { fileSize: 15 * 1024 * 1024 } });
const resumeUpload = multer({ storage: fileStorage('resumes'), limits: { fileSize: 10 * 1024 * 1024 } });

const certificateSchema = new mongoose.Schema({
  certNo: { type: String, index: true }, regNo: { type: String, index: true },
  name: String, father: String, dob: String, course: String, duration: String,
  periodFrom: String, periodTo: String, issued: String, fullMarks: mongoose.Schema.Types.Mixed,
  obtMarks: mongoose.Schema.Types.Mixed, percentage: mongoose.Schema.Types.Mixed,
  grade: String, center: String, fileUrl: String, verifiedTodayCount: { type: Number, default: 0 }
}, { strict: false, timestamps: true, collection: 'certificates' });
const contactQuerySchema = new mongoose.Schema({ name: String, phone: String, subject: String, message: String, date: Date }, { collection: 'contact_queries' });
const schoolStudentSchema = new mongoose.Schema({
  admNo: { type: String, unique: true, required: true, uppercase: true, trim: true },
  className: { type: String, required: true }, roll: String, name: { type: String, required: true },
  father: { type: String, required: true }, mobile: { type: String, required: true },
  mly: { type: Number, required: true, default: 600 }, address: String, mother: String, dob: String, gender: String, hostel: String
}, { timestamps: true, collection: 'school_students' });
const schoolBillSchema = new mongoose.Schema({
  billNo: { type: String, unique: true, required: true }, admNo: { type: String, index: true },
  name: String, className: String, father: String, mobile: String, month: String, billDate: String,
  dueDate: String, items: [{ label: String, amount: Number }], total: Number, paid: Number, dues: Number,
  status: { type: String, enum: ['Unpaid', 'Partially Paid', 'Paid'] }, mode: String, receiptNo: String, date: String
}, { timestamps: true, collection: 'school_bills' });
const gallerySchema = new mongoose.Schema({ title: { type: String, required: true }, photos: [String], createdAt: { type: Date, default: Date.now } }, { collection: 'school_gallery' });
const jobSchema = new mongoose.Schema({ title: String, loc: String, sal: String, createdAt: { type: Date, default: Date.now } }, { collection: 'consultancy_jobs' });
const candidateSchema = new mongoose.Schema({
  name: String, father: String, phone: String, email: String, qual: String,
  govId: { type: String, default: '[Aadhaar Redacted]' }, addr: String, resumeUrl: String,
  createdAt: { type: Date, default: Date.now }
}, { collection: 'consultancy_candidates' });

const Certificate = mongoose.model('Certificate', certificateSchema);
const ContactQuery = mongoose.model('ContactQuery', contactQuerySchema);
const SchoolStudent = mongoose.model('SchoolStudent', schoolStudentSchema);
const SchoolBill = mongoose.model('SchoolBill', schoolBillSchema);
const SchoolGallery = mongoose.model('SchoolGallery', gallerySchema);
const ConsultancyJob = mongoose.model('ConsultancyJob', jobSchema);
const ConsultancyCandidate = mongoose.model('ConsultancyCandidate', candidateSchema);

const fallbackCredentials = [
  ['intechnalanda@gmail.com', 'Admin@2026']
];
function credentialsValid(username, password) {
  const configured = process.env.ADMIN_USER && process.env.ADMIN_PASS
    ? [[process.env.ADMIN_USER, process.env.ADMIN_PASS]]
    : [];
  return configured.concat(fallbackCredentials).some(([u, p]) => u.toLowerCase() === String(username).trim().toLowerCase() && p === String(password).trim());
}
function tokenFor(username) {
  return crypto.createHmac('sha256', process.env.JWT_SECRET || 'intech-development-secret').update(String(username)).digest('hex');
}
function requireAuth(req, res, next) {
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const users = (process.env.ADMIN_USER && process.env.ADMIN_PASS ? [[process.env.ADMIN_USER, process.env.ADMIN_PASS]] : []).concat(fallbackCredentials);
  const valid = users.some(([username]) => token === tokenFor(username));
  if (!token || !valid) return res.status(401).json({ error: 'Authentication required' });
  next();
}
function normalizedCertificate(doc) {
  const c = doc.toObject ? doc.toObject() : doc;
  const value = (...keys) => keys.map(k => c[k]).find(v => v !== undefined && v !== null && v !== '');
  return {
    ...c, certNo: value('certNo', 'certificateNumber') || '', regNo: value('regNo', 'registrationNumber') || '',
    name: value('name', 'studentName') || '', father: value('father', 'fatherName') || '',
    course: value('course', 'courseName') || '', percentage: value('percentage', 'perc') || ''
  };
}
function fileUrl(file) { return file ? `/uploads/${file.destination.split(path.sep).pop()}/${file.filename}` : undefined; }
function removeFileUrl(url) {
  if (!url || !url.startsWith('/uploads/')) return;
  const target = path.join(root, 'public', url.replace(/^\/+/, ''));
  if (fs.existsSync(target)) fs.unlinkSync(target);
}
function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

app.post('/api/auth/login', (req, res) => {
  if (!credentialsValid(req.body.username, req.body.password)) return res.status(401).json({ success: false, error: 'Invalid credentials' });
  res.json({ success: true, token: tokenFor(req.body.username) });
});

app.get('/api/school/bootstrap', asyncRoute(async (_req, res) => {
  const [students, bills, gallery] = await Promise.all([SchoolStudent.find().lean(), SchoolBill.find().sort({ createdAt: -1 }).lean(), SchoolGallery.find().sort({ createdAt: -1 }).lean()]);
  res.json({ students, bills, gallery });
}));
app.post('/api/school/students', requireAuth, asyncRoute(async (req, res) => {
  const student = await SchoolStudent.findOneAndUpdate({ admNo: String(req.body.admNo).trim().toUpperCase() }, { ...req.body, admNo: String(req.body.admNo).trim().toUpperCase() }, { upsert: true, new: true, runValidators: true });
  res.json(student);
}));
app.post('/api/school/students/bulk', requireAuth, asyncRoute(async (req, res) => {
  const rows = Array.isArray(req.body.students) ? req.body.students : [];
  const operations = rows.filter(s => s.admNo && s.name).map(s => ({ updateOne: { filter: { admNo: String(s.admNo).trim().toUpperCase() }, update: { $set: { ...s, admNo: String(s.admNo).trim().toUpperCase() } }, upsert: true } }));
  if (operations.length) await SchoolStudent.bulkWrite(operations, { ordered: false });
  res.json({ success: true, count: operations.length });
}));
app.post('/api/school/students/promote', requireAuth, asyncRoute(async (_req, res) => {
  const map = { PLAY: 'NURSERY', NURSERY: 'LKG', LKG: 'UKG', UKG: 'CLASS 1', 'CLASS 1': 'CLASS 2', 'CLASS 2': 'CLASS 3', 'CLASS 3': 'CLASS 4', 'CLASS 4': 'CLASS 5' };
  const students = await SchoolStudent.find();
  await Promise.all(students.map(s => { const next = map[String(s.className).toUpperCase()]; if (next) { s.className = next; return s.save(); } return null; }));
  res.json({ success: true });
}));
app.delete('/api/school/students/:admNo', requireAuth, asyncRoute(async (req, res) => { await SchoolStudent.deleteOne({ admNo: req.params.admNo.toUpperCase() }); res.json({ success: true }); }));
app.post('/api/school/bills', requireAuth, asyncRoute(async (req, res) => { res.json(await SchoolBill.create(req.body)); }));
app.post('/api/school/bills/bulk', requireAuth, asyncRoute(async (req, res) => { res.json({ bills: await SchoolBill.insertMany(req.body.bills || [], { ordered: false }) }); }));
app.patch('/api/school/bills/:billNo/pay', requireAuth, asyncRoute(async (req, res) => {
  const bill = await SchoolBill.findOne({ billNo: req.params.billNo });
  if (!bill) return res.status(404).json({ error: 'Bill not found' });
  const amount = Number(req.body.amount) || 0;
  bill.paid = Math.min(Number(bill.total) || 0, (Number(bill.paid) || 0) + amount);
  bill.dues = Math.max(0, bill.total - bill.paid); bill.status = bill.dues === 0 ? 'Paid' : 'Partially Paid';
  bill.receiptNo = bill.receiptNo || `REC-${Math.floor(100000 + Math.random() * 900000)}`; bill.date = new Date().toISOString().slice(0, 19).replace('T', ' ');
  res.json(await bill.save());
}));
app.post('/api/school/gallery', requireAuth, galleryUpload.array('photos', 10), asyncRoute(async (req, res) => {
  const photos = (req.files || []).map(fileUrl);
  res.json(await SchoolGallery.create({ title: req.body.title, photos }));
}));
app.delete('/api/school/gallery/:id', requireAuth, asyncRoute(async (req, res) => {
  const event = await SchoolGallery.findByIdAndDelete(req.params.id); if (event) event.photos.forEach(removeFileUrl); res.json({ success: true });
}));

app.get('/api/certificates', asyncRoute(async (_req, res) => { const docs = await Certificate.find().sort({ createdAt: -1 }).lean(); res.json({ certificates: docs.map(normalizedCertificate), total: docs.length }); }));
app.get('/api/certificates/verify', asyncRoute(async (req, res) => {
  const q = String(req.query.q || '').trim(); if (!q) return res.status(404).json({ error: 'Certificate not found' });
  const re = new RegExp(`^${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
  const doc = await Certificate.findOne({ $or: [{ certNo: re }, { regNo: re }, { certificateNumber: re }, { registrationNumber: re }] });
  if (!doc) return res.status(404).json({ error: 'Certificate not found' });
  doc.verifiedTodayCount = (doc.verifiedTodayCount || 0) + 1; await doc.save();
  res.json(normalizedCertificate(doc));
}));
app.post('/api/certificates', requireAuth, certificateUpload.single('file'), asyncRoute(async (req, res) => { res.json(normalizedCertificate(await Certificate.create({ ...req.body, fileUrl: fileUrl(req.file) }))); }));
app.put('/api/certificates/:id', requireAuth, asyncRoute(async (req, res) => {
  const query = mongoose.isValidObjectId(req.params.id) ? { _id: req.params.id } : { $or: [{ certNo: req.params.id }, { certificateNumber: req.params.id }] };
  const doc = await Certificate.findOneAndUpdate(query, req.body, { new: true, runValidators: false }); if (!doc) return res.status(404).json({ error: 'Certificate not found' }); res.json(normalizedCertificate(doc));
}));
app.delete('/api/certificates/:id', requireAuth, asyncRoute(async (req, res) => {
  const query = mongoose.isValidObjectId(req.params.id) ? { _id: req.params.id } : { $or: [{ certNo: req.params.id }, { certificateNumber: req.params.id }] };
  const doc = await Certificate.findOneAndDelete(query); if (doc) removeFileUrl(doc.fileUrl); res.json({ success: true });
}));
app.get('/api/consultancy/bootstrap', asyncRoute(async (_req, res) => { const [jobs, candidates] = await Promise.all([ConsultancyJob.find().sort({ createdAt: -1 }).lean(), ConsultancyCandidate.find().sort({ createdAt: -1 }).lean()]); res.json({ jobs, candidates }); }));
app.post('/api/consultancy/jobs', requireAuth, asyncRoute(async (req, res) => { res.json(await ConsultancyJob.create(req.body)); }));
app.post('/api/consultancy/candidates', resumeUpload.single('resume'), asyncRoute(async (req, res) => { res.json(await ConsultancyCandidate.create({ ...req.body, govId: '[Aadhaar Redacted]', resumeUrl: fileUrl(req.file) })); }));
app.delete('/api/consultancy/candidates/:id', requireAuth, asyncRoute(async (req, res) => { const c = await ConsultancyCandidate.findByIdAndDelete(req.params.id); if (c) removeFileUrl(c.resumeUrl); res.json({ success: true }); }));

app.use((err, _req, res, _next) => { console.error(err); res.status(500).json({ error: 'Internal server error' }); });
app.get('*', (_req, res) => res.sendFile(path.join(root, 'public', 'index.html')));

app.listen(PORT, () => console.log(`Intech Groups listening on port ${PORT}`));
mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/intech_groups')
  .then(() => console.log('MongoDB connected'))
  .catch(error => console.error('MongoDB connection failed:', error.message));
