require('dotenv').config();
const express = require('express');
const nodemailer = require('nodemailer');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Serve static files from root
app.use(express.static(__dirname));

const sender = process.env.EMAIL_USER;
const password = process.env.EMAIL_PASS;

const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 465,
  secure: true,
  auth: {
    user: sender,
    pass: password
  }
});

// Email sending API endpoint
app.post('/api/send-email', (req, res) => {
  const { to, subject, body } = req.body;
  
  if (!to || !subject || !body) {
    return res.status(400).json({ error: "Missing required fields: to, subject, body" });
  }

  const mailOptions = {
    from: `"Kameti Club" <${sender}>`,
    to: to,
    subject: subject,
    html: body
  };

  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      console.error("Failed to send email:", error);
      return res.status(500).json({ error: error.message });
    }
    console.log(`Email sent to ${to}: ${info.response}`);
    res.json({ success: true, message: info.response });
  });
});

// Proxy route for Gemini API
app.post('/api/gemini', async (req, res) => {
  const { prompt } = req.body;
  if (!prompt) return res.status(400).json({ error: "Missing prompt" });

  const apiKey = process.env.GEMINI_KEY;
  if (!apiKey) return res.status(500).json({ error: "Gemini API key is not configured on server." });

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }]
      })
    });
    const data = await response.json();
    if (data.candidates && data.candidates[0].content.parts[0].text) {
      res.json({ text: data.candidates[0].content.parts[0].text });
    } else {
      res.status(500).json({ error: "Invalid response from Gemini", details: data });
    }
  } catch (err) {
    console.error("Gemini API Error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Proxy route for Groq API
app.post('/api/groq', async (req, res) => {
  const { prompt } = req.body;
  if (!prompt) return res.status(400).json({ error: "Missing prompt" });

  const apiKey = process.env.GROQ_KEY;
  if (!apiKey) return res.status(500).json({ error: "Groq API key is not configured on server." });

  try {
    const response = await fetch(`https://api.groq.com/openai/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "llama3-70b-8192",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.7
      })
    });
    const data = await response.json();
    if (data.choices && data.choices[0].message.content) {
      res.json({ text: data.choices[0].message.content });
    } else {
      res.status(500).json({ error: "Invalid response from Groq", details: data });
    }
  } catch (err) {
    console.error("Groq API Error:", err);
    res.status(500).json({ error: err.message });
  }
});

// User-Agent parser utility
function parseUserAgent(ua) {
  let device = 'Desktop';
  let os = 'Unknown OS';

  if (!ua) return { device, os };

  if (/tablet|ipad|playbook|silk/i.test(ua)) {
    device = 'Tablet';
  } else if (/Mobile|Android|iP(hone|od)|IEMobile|BlackBerry|Kindle|Opera Mini/i.test(ua)) {
    device = 'Mobile';
  }

  if (/Windows/i.test(ua)) os = 'Windows';
  else if (/Macintosh/i.test(ua)) os = 'macOS';
  else if (/iPhone|iPad|iPod/i.test(ua)) os = 'iOS';
  else if (/Android/i.test(ua)) os = 'Android';
  else if (/Linux/i.test(ua)) os = 'Linux';

  return { device, os };
}

// Visitor Analytics Database In-Memory Cache (Real logs only)
let visitorLogs = [];

app.post('/api/log-visit', (req, res) => {
  const ip = req.headers['x-real-ip'] || req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
  const cleanIp = ip.split(',')[0].trim();

  // Falling back to standard values since local dev doesn't have Vercel geo headers
  const countryCode = req.headers['x-vercel-ip-country'] || 'PK';
  const countryMap = {
    'PK': 'Pakistan',
    'AE': 'United Arab Emirates',
    'US': 'United States',
    'GB': 'United Kingdom',
    'CA': 'Canada',
    'SA': 'Saudi Arabia',
    'IN': 'India'
  };
  const country = countryMap[countryCode] || countryCode;
  
  let city = 'Karachi';
  if (req.headers['x-vercel-ip-city']) {
    try {
      city = decodeURIComponent(req.headers['x-vercel-ip-city']);
    } catch(e) {
      city = req.headers['x-vercel-ip-city'];
    }
  }

  const ua = req.headers['user-agent'] || '';
  const { device, os } = parseUserAgent(ua);

  visitorLogs.unshift({
    ip: cleanIp,
    country: country,
    city: city,
    device: device,
    os: os,
    userAgent: ua.substring(0, 100),
    timestamp: new Date().toISOString()
  });

  if (visitorLogs.length > 500) {
    visitorLogs.pop();
  }

  res.json({ success: true });
});

app.get('/api/visits', (req, res) => {
  res.json(visitorLogs);
});

// Catch-all route to serve index.html for single-page app navigation
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`==================================================`);
  console.log(`🚀 Kameti Club server running at http://localhost:${PORT}`);
  console.log(`🔒 Gmail SMTP & APIs configured securely on backend`);
  console.log(`==================================================`);
});
