document.addEventListener('DOMContentLoaded', () => {
    const toggleBtn = document.getElementById('themeToggle');
  if (localStorage.getItem('theme') === 'dark') {
    document.body.classList.add('dark-mode');
    toggleBtn.textContent = 'Switch to Light Mode';
  } else {
    toggleBtn.textContent = 'Switch to Dark Mode';
  }
  toggleBtn.addEventListener('click', () => {
    document.body.classList.toggle('dark-mode');
    const isDark = document.body.classList.contains('dark-mode');
    toggleBtn.textContent = isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode';
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
  });

    const fileInput = document.getElementById('fileInput');
    const uploadText = document.getElementById('upload-text');
    const uploadIcon = document.getElementById('upload-icon');
    fileInput.addEventListener('change', () => {
        if (fileInput.files.length > 0) {
            uploadText.textContent = `The ${fileInput.files[0].name} has been uploaded!` ;
            uploadIcon.innerHTML = `<svg width="48" height="48" viewBox="0 0 24 24" fill="#4A90E2" xmlns="http://www.w3.org/2000/svg">
  <path d="M14 2H6C4.89543 2 4 2.89543 4 4V20C4 21.1046 4.89543 22 6 22H18C19.1046 22 20 21.1046 20 20V8L14 2Z" fill="#4A90E2"/>
  <path d="M14 2V8H20" fill="#B0D4F1"/>
</svg>
` ;
        } else {
            uploadText.textContent = 'Drag & drop files here, or click to browse';
        }
    });

  const form = document.getElementById('healthForm');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    // 1) Collect your form data
    const formData = new FormData(form);
    const data = {};
    for (let [k, v] of formData.entries()) {
      if (!v) continue;
      data[k] = isNaN(v) ? v : parseFloat(v);
    }

    // 2) (Optional) If you have file uploads, handle them here…
    //    Otherwise go straight to analysis:
    await analyzeHealthData(data);
  });

  
const pdfjsLib = window['pdfjs-dist/build/pdf'];
// Helper: call your custom advice API
async function getCustomAdvice(data, riskScores) {
  const resp = await fetch('http://localhost:3000/api/custom-advice', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data, riskScores })
  });
  if (!resp.ok) {
    console.error('Custom advice API error', await resp.text());
    return 'Sorry, could not generate custom advice.';
  }
  const { advice } = await resp.json();
  return advice;
}


// Form submission handler 
document.getElementById('healthForm').addEventListener('submit', async function (event) {
  event.preventDefault();

  // Reset previous results and charts
  const resultDiv = document.getElementById('result');
  resultDiv.style.display = 'none';
  resultDiv.innerHTML = '';
  document.getElementById('charts-container').innerHTML = '';

  // Collect inputs
  const formData = new FormData(event.target);
  const data = {};
  for (const [key, value] of formData.entries()) {
    if (!value) continue;
    data[key] = key === 'gender' ? value : parseFloat(value);
  }

  // Compute BMI if needed
  if (!data.bmi && data.height && data.weight) {
    const h = data.height / 100;
    data.bmi = parseFloat((data.weight / (h * h)).toFixed(2));
  }

  // OCR or direct analysis
  const fileInput = document.getElementById('fileInput');
  if (fileInput.files.length) {
    await extractTextFromFile(fileInput.files[0], data);
  } else {
    await analyzeHealthData(data);
  }
});

// OCR extraction
// OCR extraction & auto-fill
async function extractTextFromFile(file, formData) {
  let text;

  if (file.type === 'application/pdf') {
    text = await extractTextFromPDF(file);
  } else {
    text = await extractTextFromImage(file);
  }

  // 1) parse numbers
  const extracted = parseTextForValues(text);
  console.log('📄 Extracted from file:', extracted);

  // 2) auto-fill form fields
  for (const [key, val] of Object.entries(extracted)) {
    const input = document.getElementById(key);
    if (input) {
      input.value = val;           
      formData[key] = val;         
    }
  }

  // 3) proceed with analysis including extracted values
  await analyzeHealthData({ ...formData, ...extracted });
}

console.log('🔍 Raw extracted text:', text);

// 3) New helper: PDF → text
async function extractTextFromPDF(file) {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  let fullText = '';

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();
    const strings = content.items.map(item => item.str).join(' ');
    fullText += strings + '\n';
  }

  return fullText;
}

// 4) New helper: image → text (your old Tesseract flow)
async function extractTextFromImage(file) {
  const dataUrl = await new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(file);
  });

  const { createWorker } = Tesseract;
  const worker = await createWorker({ logger: m => console.log(m) });
  await worker.load();
  await worker.loadLanguage('eng');
  await worker.initialize('eng');
  const { data: { text } } = await worker.recognize(dataUrl);
  await worker.terminate();
  
  return text;
}

// Regex parser
function parseTextForValues(text) {
  // Normalize whitespace so our regexes work across PDFs/OCRs
  const clean = text.replace(/\s+/g, ' ').trim();

  const patterns = {
    glucose:        /glucose[^\d]*(\d+(\.\d+)?)/i,
    cholesterol:    /(?:total\s+)?cholesterol[^\d]*(\d+(\.\d+)?)/i,
    triglycerides:  /triglycerides[^\d]*(\d+(\.\d+)?)/i,
    hdl:            /\bHDL[^\d]*(\d+(\.\d+)?)/i,
    ldl:            /\bLDL[^\d]*(\d+(\.\d+)?)/i,
    systolic:       /systolic[^\d]*(\d+(\.\d+)?)/i,
    diastolic:      /diastolic[^\d]*(\d+(\.\d+)?)/i,
    pulse:          /pulse[^\d]*(\d+(\.\d+)?)/i,
    bmi:            /bmi[^\d]*(\d+(\.\d+)?)/i,
    crp:            /crp[^\d]*(\d+(\.\d+)?)/i,
    waist:          /waist[^\d]*(\d+(\.\d+)?)/i,
    temperature:    /temperature[^\d]*(\d+(\.\d+)?)/i,
    workout:        /workout[^\d]*(\d+(\.\d+)?)/i
  };

  const out = {};
  for (const [key, regex] of Object.entries(patterns)) {
    const m = clean.match(regex);
    if (m) {
      out[key] = parseFloat(m[1]);
    }
  }
  return out;
}


// Summary builder
function buildHealthSummary(data, riskScores) {
  const parts = [];
  if (data.gender) parts.push(`Gender: ${data.gender}`);
  if (data.age != null) parts.push(`Age: ${data.age}`);
  if (data.bmi != null) parts.push(`BMI: ${data.bmi}`);
  if (data.systolic != null && data.diastolic != null)
    parts.push(`BP: ${data.systolic}/${data.diastolic} mmHg`);
  if (data.glucose != null) parts.push(`Glucose: ${data.glucose} mg/dL`);
  if (data.cholesterol != null) parts.push(`Cholesterol: ${data.cholesterol} mg/dL`);
  if (data.pulse != null) parts.push(`Pulse: ${data.pulse} bpm`);
  if (data.waist != null) parts.push(`Waist: ${data.waist} cm`);
  if (data.crp != null) parts.push(`CRP: ${data.crp} mg/L`);
  if (data.temperature != null) parts.push(`Temp: ${data.temperature} °C`);
  if (data.workout != null) parts.push(`Workout: ${data.workout} min/day`);

  for (const [cond, pct] of Object.entries(riskScores)) {
    parts.push(`${cond} risk: ${pct}%`);
  }
  return parts.join('; ');
}

// Load advice templates and assemble custom advice
async function assembleAdvice(data, riskScores) {
  async function assembleAdvice(data, riskScores) {
  console.log('🔧 assembleAdvice called with', data, riskScores);
  const res = await fetch('/advice.json');
  console.log('📥 advice.json status:', res.status);
  const adviceTemplates = await res.json();
  console.log('📚 Loaded templates keys:', Object.keys(adviceTemplates));
  // …
}

  const res = await fetch('advice.json');
  const adviceTemplates = await res.json();
  const used = new Set();

  function pickRandom(list, count = 1) {
    const shuffled = list.filter(item => !used.has(item)).sort(() => 0.5 - Math.random());
    const selected = shuffled.slice(0, count);
    selected.forEach(item => used.add(item));
    return selected;
  }

  let advice = [];

  // General vitals-based (4–7)
  const generalKeys = Object.keys(adviceTemplates.general || {});
  generalKeys.forEach(k => {
    const val = data[k];
    if (val != null) {
      const rules = adviceTemplates.general[k];
      for (const rule of rules) {
        if (val >= rule.min && val <= rule.max && !used.has(rule.text)) {
          advice.push(rule.text);
          used.add(rule.text);
          break;
        }
      }
    }
  });
  advice = advice.concat(pickRandom(advice, 4));

  // Disease-specific (3)
  Object.entries(riskScores).forEach(([cond, risk]) => {
    const rules = adviceTemplates.disease[cond] || [];
    for (const rule of rules) {
      if (risk >= rule.min && risk <= rule.max && !used.has(rule.text)) {
        advice.push(rule.text);
        used.add(rule.text);
        break;
      }
    }
  });
  advice = advice.concat(pickRandom(advice, 3));

  // Overall (1)
  const avg = Math.round(Object.values(riskScores).reduce((a, b) => a + b, 0) / Object.keys(riskScores).length);
  const overallRules = adviceTemplates.overall || [];
  for (const rule of overallRules) {
    if (avg >= rule.min && avg <= rule.max && !used.has(rule.text)) {
      advice.push(rule.text);
      used.add(rule.text);
      break;
    }
  }

  return advice.join(' ');
}


// Main analysis 
async function analyzeHealthData(data) {
  const resultDiv = document.getElementById('result');

  // Prepare text
  let resultText = '<h3>Health Analysis Results</h3>';
  const riskScores = {};

  if (!Object.keys(data).length) {
    resultText += '<p>No data provided.</p>';
  } else {
    const male = data.gender === 'male';

    // Heart Disease
    let h = 0;
    if (data.systolic > 120) h += (data.systolic - 120) * 0.8;
    if (data.cholesterol > 200) h += (data.cholesterol - 200) * (male ? 0.5 : 0.4);
    if (data.crp > 10) h += 10;
    if (data.pulse < 60 || data.pulse > 100) h += 8;
    riskScores['Heart Disease'] = Math.min(Math.round(h), 100);

    // Diabetes
    let d = 0;
    if (data.glucose > 100) d += (data.glucose - 100) * 0.7;
    if (data.age > 45) d += 10;
    riskScores['Diabetes'] = Math.min(Math.round(d), 100);

    // Obesity
    let o = 0;
    if (data.bmi >= 25) o += (data.bmi - 24.9) * 3;
    if (data.waist > (male ? 102 : 88)) o += 15;
    riskScores['Obesity'] = Math.min(Math.round(o), 100);

    // Build resultText
    for (const [cond, pct] of Object.entries(riskScores)) {
      resultText += `<p>${cond} Risk: ${pct}%</p>`;
    }
  }

  // Set initial structure in resultDiv
  resultDiv.innerHTML = `
    ${resultText}
    <h3>Health Insights</h3>
    <div id="advice-container"></div>
    <div id="charts-container"></div>
  `;

  // Generate and append charts inside resultDiv's charts-container
  const chartContainer = document.getElementById('charts-container');
  for (const [cond, pct] of Object.entries(riskScores)) {
    generateRiskChart(cond, pct);
  }
  const overall = Math.round(
    Object.values(riskScores).reduce((a, b) => a + b, 0) /
      Object.keys(riskScores).length
  );
  generateRiskChart('Overall Health', overall);

  // Fetch custom advice and display it line by line
  const customAdvice = await getCustomAdvice(data, riskScores);
  const adviceContainer = document.getElementById('advice-container');
  const sentences = customAdvice.split('. ').filter(s => s.trim());
  let delay = 0;
  sentences.forEach(sentence => {
    setTimeout(() => {
      const p = document.createElement('p');
      p.textContent = sentence.trim() + '.';
      adviceContainer.appendChild(p);
    }, delay);
    delay += 1000; // 1-second delay between sentences
  });

  // Show the result div
  resultDiv.style.display = 'block';
}

// Pie chart helper
function generateRiskChart(disease, riskPercent) {
  const container = document.getElementById('charts-container');
  const wrapper = document.createElement('div');
  wrapper.style.width = '300px';
  wrapper.style.height = '300px';
  wrapper.style.display = 'inline-block';
  wrapper.style.margin = '20px';

  const canvas = document.createElement('canvas');
  wrapper.appendChild(canvas);
  container.appendChild(wrapper);

  new Chart(canvas, {
    type: 'pie',
    data: {
      labels: [`${disease} Risk`, 'No Risk'],
      datasets: [
        {
          data: [riskPercent, 100 - riskPercent],
          backgroundColor: ['#3B82F6', '#BFDBFE']
        }
      ]
    },
    options: {
      responsive: true,
      plugins: {
        title: { display: true, text: `${disease} Risk: ${riskPercent}%` },
        legend: { position: 'bottom' }
      }
    }
  });
}


});



