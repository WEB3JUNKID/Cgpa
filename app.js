// ====== FIREBASE SETUP (Replace with your actual config from Firebase Console) ======
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { 
  getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { 
  getFirestore, doc, setDoc, getDoc, collection, getDocs, writeBatch 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDvbUhbvz67IgEnc0CQB6chU1__jcNk-QA",
  authDomain: "cgpa-calcull.firebaseapp.com",
  projectId: "cgpa-calcull",
  storageBucket: "cgpa-calcull.firebasestorage.app",
  messagingSenderId: "571324658546",
  appId: "1:571324658546:web:d6c908ae621da6d8b4e3eb",
    measurementId: "G-ST9DDKM8F8"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// ====== GLOBAL STATE & DOM ELEMENTS ======
let currentUser = null;
let currentProfile = null;
let activeModalSemesterId = null; 
// e.g., "100_1" for 100 level, 1st semester

const views = {
  auth: document.getElementById('auth-view'),
  setup: document.getElementById('setup-view'),
  dashboard: document.getElementById('dashboard-view')
};

// Math Mapping for Standard 5.0
const gradeMap = { 'A': 5, 'B': 4, 'C': 3, 'D': 2, 'E': 1, 'F': 0 };

// ====== AUTHENTICATION FLOW ======
onAuthStateChanged(auth, async (user) => {
  if (user) {
    currentUser = user;
    await loadUserProfile();
  } else {
    currentUser = null;
    currentProfile = null;
    showView('auth');
  }
});

function showView(viewId) {
  Object.values(views).forEach(v => v.classList.add('hidden'));
  views[viewId].classList.remove('hidden');
}

document.getElementById('btn-signup').addEventListener('click', async () => {
  const email = document.getElementById('auth-email').value;
  const pass = document.getElementById('auth-password').value;
  try { await createUserWithEmailAndPassword(auth, email, pass); } 
  catch (error) { document.getElementById('auth-msg').innerText = "Oops: " + error.message; }
});

document.getElementById('btn-login').addEventListener('click', async () => {
  const email = document.getElementById('auth-email').value;
  const pass = document.getElementById('auth-password').value;
  try { await signInWithEmailAndPassword(auth, email, pass); } 
  catch (error) { document.getElementById('auth-msg').innerText = "Oops: " + error.message; }
});

document.getElementById('btn-logout').addEventListener('click', () => signOut(auth));


// ====== PROFILE SETUP FLOW ======
document.getElementById('btn-save-profile').addEventListener('click', async () => {
  const name = document.getElementById('setup-name').value;
  const school = document.getElementById('setup-school').value;
  const years = parseInt(document.getElementById('setup-years').value);

  if (!name || !school || !years) return alert("Please fill all fields softly.");

  const profileData = { fullName: name, school: school, totalYears: years, currentCGPA: 0 };
  
  await setDoc(doc(db, "users", currentUser.uid), profileData);
  await loadUserProfile();
});

async function loadUserProfile() {
  const docSnap = await getDoc(doc(db, "users", currentUser.uid));
  if (docSnap.exists()) {
    currentProfile = docSnap.data();
    renderDashboard();
    showView('dashboard');
  } else {
    showView('setup');
  }
}

// ====== DASHBOARD & TIMELINE GENERATION ======
async function renderDashboard() {
  document.getElementById('dash-greeting').innerText = `Hello, ${currentProfile.fullName.split(' ')[0]}`;
  document.getElementById('dash-school').innerText = currentProfile.school;
  
  const timelineContainer = document.getElementById('timeline-container');
  timelineContainer.innerHTML = '';

  // Fetch all saved semesters from Firestore subcollection
  const semestersSnapshot = await getDocs(collection(db, "users", currentUser.uid, "semesters"));
  let savedSemesters = {}; // Map of "level_term" -> data
  
  let grandTotalPoints = 0;
  let grandTotalUnits = 0;

  semestersSnapshot.forEach(doc => {
    const data = doc.data();
    savedSemesters[doc.id] = data;
    grandTotalPoints += data.totalPoints;
    grandTotalUnits += data.totalUnits;
  });

  // Calculate CGPA: $$CGPA = \frac{Total Points}{Total Units}$$
  const cgpa = grandTotalUnits > 0 ? (grandTotalPoints / grandTotalUnits).toFixed(2) : "0.00";
  document.getElementById('dash-cgpa').innerText = cgpa;
  
  // Update main profile document with new CGPA in background
  if (currentProfile.currentCGPA != cgpa) {
    setDoc(doc(db, "users", currentUser.uid), { currentCGPA: cgpa }, { merge: true });
  }

  // Generate cards based on total years user selected during setup
  for (let year = 1; year <= currentProfile.totalYears; year++) {
    const level = year * 100;
    
    // First Semester Card
    createSemesterCard(level, 1, savedSemesters[`${level}_1`], timelineContainer);
    // Second Semester Card
    createSemesterCard(level, 2, savedSemesters[`${level}_2`], timelineContainer);
  }
}

function createSemesterCard(level, termNum, savedData, container) {
  const termName = termNum === 1 ? "First Semester" : "Second Semester";
  const hasData = !!savedData;
  const sgpa = hasData ? savedData.gpa : "Not Inputted";
  
  const card = document.createElement('div');
  card.className = 'semester-card';
  card.innerHTML = `
    <h4 style="color: #334155; margin-bottom: 4px;">${level} Level</h4>
    <p class="text-muted" style="font-size: 13px;">${termName}</p>
    <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 20px; border-top: 1px solid #F1F5F9; padding-top: 15px;">
      <span style="font-size: 14px; font-weight: 500;">Semester GPA</span>
      <span class="${hasData ? 'sgpa-badge' : 'text-muted'}">${sgpa}</span>
    </div>
  `;

  // Attach click event to open Modal (For both NEW INPUT and EDITING existing)
  card.addEventListener('click', () => openSemesterModal(`${level}_${termNum}`, level, termName, savedData));
  container.appendChild(card);
}


// ====== MODAL: INPUT & EDITING ENGINE ======
const modal = document.getElementById('semester-modal');
const courseList = document.getElementById('course-list');

document.getElementById('btn-close-modal').addEventListener('click', () => modal.classList.add('hidden'));

function openSemesterModal(semesterId, level, termName, existingData) {
  activeModalSemesterId = semesterId;
  document.getElementById('modal-title').innerText = `${level} Level - ${termName}`;
  courseList.innerHTML = '';
  document.getElementById('preview-sgpa').innerText = existingData ? existingData.gpa : "0.00";

  if (existingData && existingData.courses) {
    // Editing Mode: Populate existing courses
    existingData.courses.forEach(course => addCourseRow(course.title, course.units, course.grade));
  } else {
    // New Mode: Start with 3 empty rows
    addCourseRow(); addCourseRow(); addCourseRow();
  }

  modal.classList.remove('hidden');
}

document.getElementById('btn-add-course').addEventListener('click', () => addCourseRow());

function addCourseRow(title = '', units = '', grade = '') {
  const rowId = `row-${Date.now()}-${Math.random()}`;
  const row = document.createElement('div');
  row.className = 'course-row';
  row.id = rowId;

  // Reusable dropdown HTML
  const gradeOptions = ['A','B','C','D','E','F'].map(g => `<option value="${g}" ${grade === g ? 'selected' : ''}>${g}</option>`).join('');

  row.innerHTML = `
    <input type="text" class="form-input course-title" placeholder="Course Code" value="${title}" style="margin: 0;">
    <input type="number" class="form-input course-units" placeholder="Units" value="${units}" min="1" max="6" style="margin: 0;">
    <select class="form-input course-grade" style="margin: 0;">
      <option value="" disabled ${!grade ? 'selected' : ''}>Grade</option>
      ${gradeOptions}
    </select>
    <button class="btn btn-icon" onclick="document.getElementById('${rowId}').remove()">×</button>
  `;
  courseList.appendChild(row);
}

// ====== SAVE AND CALCULATE GPA ======
document.getElementById('btn-save-semester').addEventListener('click', async () => {
  const rows = document.querySelectorAll('.course-row');
  let courses = [];
  let semesterUnits = 0;
  let semesterPoints = 0;

  rows.forEach(row => {
    const title = row.querySelector('.course-title').value.trim();
    const units = parseInt(row.querySelector('.course-units').value);
    const grade = row.querySelector('.course-grade').value;

    if (title && units && grade) {
      courses.push({ title, units, grade });
      semesterUnits += units;
      semesterPoints += (units * gradeMap[grade]);
    }
  });

  if (courses.length === 0) return alert("Please add at least one valid course.");

  // Math: $GPA = \frac{\sum (Units \times Grade Points)}{\sum Units}$
  const sgpa = (semesterPoints / semesterUnits).toFixed(2);
  
  // Save/Update in Firestore (This inherently handles the 'Edit' overwrite functionality)
  const docRef = doc(db, "users", currentUser.uid, "semesters", activeModalSemesterId);
  await setDoc(docRef, {
    courses: courses,
    totalUnits: semesterUnits,
    totalPoints: semesterPoints,
    gpa: sgpa,
    updatedAt: new Date()
  });

  document.getElementById('preview-sgpa').innerText = sgpa;
  
  // Close modal and recalculate main dashboard
  setTimeout(() => {
    modal.classList.add('hidden');
    renderDashboard(); 
  }, 500); // 500ms cooling delay
});
                   
