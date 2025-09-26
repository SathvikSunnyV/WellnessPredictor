// server/server.js
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs/promises');

const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

//Custom Advice generator
app.post('/api/custom-advice', async (req, res) => {
  try {
    const { data, riskScores } = req.body;
    const raw = await fs.readFile(path.join(__dirname, 'advice.json'), 'utf8');
    const library = JSON.parse(raw);

    // 1) VITAL-BASED STATEMENTS
    const vitalKeys = [
      'glucose','cholesterol','ldl','hdl',
      'triglycerides','crp','waist','systolic','diastolic'
    ];
    const vitals = [];

    // define healthy thresholds
    const thresholds = {
      glucose: 100,
      cholesterol: 200,
      ldl: 100,
      hdl: 60,             
      triglycerides: 150,
      crp: 3,
      systolic: 120,
      diastolic: 80
    };

    for (const key of vitalKeys) {
      const val = data[key];
      if (val == null) continue;

      // decide positive vs negative
      let positive;
      if (key === 'waist') {
        const limit = data.gender === 'male' ? 102 : 88;
        positive = val <= limit;
      } else if (key === 'hdl') {
        positive = val >= thresholds.hdl;
      } else {
        positive = val <= (thresholds[key] ?? Infinity);
      }
      const cat = positive ? 'positive' : 'negative';
      const bucket = library[key]?.[cat] || [];
      if (!bucket.length) continue;

      // pick one at random
      const tpl = bucket[Math.floor(Math.random() * bucket.length)];
      // replace placeholders
      const sentence = tpl.replace(/\{([^}]+)\}/g, (_, k) =>
        (data[k] !== undefined ? data[k] : riskScores[k] !== undefined ? riskScores[k] : `{${k}}`)
      );
      vitals.push(sentence);
    }

    // sample 4–7 vitals
    const shuffledVitals = vitals.sort(() => 0.5 - Math.random());
    const vitalCount = Math.min(shuffledVitals.length, 4 + Math.floor(Math.random() * 4));
    const vitalSentences = shuffledVitals.slice(0, vitalCount);


    // 2) DISEASE STATEMENTS (exactly 3)
    const diseaseKeys = ['Heart Disease','Diabetes','Obesity'];
    const diseaseSentences = diseaseKeys.map(cond => {
      const pct = riskScores[cond] ?? 0;
      const templates = library[cond] || {};
      const cat = pct <= 50 ? 'positive' : 'negative';
      const bucket = templates[cat] || [];
      if (!bucket.length) return null;

      // pick index proportional to pct
      const ratio = cat === 'positive' ? pct/50 : (pct - 50)/50;
      let idx = Math.floor(ratio * bucket.length);
      idx = Math.min(bucket.length -1, Math.max(0, idx));
      const tpl = bucket[idx];
      return tpl.replace(/\{([^}]+)\}/g, (_, k) =>
        (data[k] !== undefined ? data[k] : riskScores[k] !== undefined ? riskScores[k] : `{${k}}`)
      );
    }).filter(Boolean);


    // 3) OVERALL STATEMENT
const avg = Math.round(
  Object.values(riskScores).reduce((a, b) => a + b, 0) /
  Object.keys(riskScores).length
);

// Make {Overall} resolvable
riskScores['Overall'] = avg;

const overallBucket = avg <= 50
  ? library['Overall'].positive || []
  : library['Overall'].negative || [];

let overallSentence = '';
if (overallBucket.length) {
  const tpl = overallBucket[Math.floor(Math.random() * overallBucket.length)];
  overallSentence = tpl.replace(/\{([^}]+)\}/g, (_, key) =>
    data[key] !== undefined
      ? data[key]
      : riskScores[key] !== undefined
        ? riskScores[key]
        : `{${key}}`
  );
}


    // 4) BUILD FINAL RESPONSE
    const allSentences = [
      ...vitalSentences,
      ...diseaseSentences,
      overallSentence
    ].filter(s => !!s);

    res.json({ advice: allSentences.join(' ') });
  }
  catch (e) {
    console.error('Custom advice error:', e);
    res.status(500).json({ error: 'Custom advice failed' });
  }
});

// Fallback to index.html for all other GETs
app.get('/*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
