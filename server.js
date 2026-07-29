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

// Visitor Analytics Database In-Memory Cache
let visitorLogs = [
  { ip: "119.160.119.42", country: "Pakistan", city: "Karachi", device: "Mobile", os: "Android", userAgent: "Android 13 Chrome Mobile", timestamp: new Date(Date.now() - 5 * 60 * 1000).toISOString() },
  { ip: "39.40.122.95", country: "Pakistan", city: "Lahore", device: "Desktop", os: "Windows", userAgent: "Windows 10 Chrome", timestamp: new Date(Date.now() - 25 * 60 * 1000).toISOString() },
  { ip: "182.180.88.21", country: "Pakistan", city: "Islamabad", device: "Mobile", os: "iOS", userAgent: "iPhone iOS 16 Safari", timestamp: new Date(Date.now() - 48 * 60 * 1000).toISOString() },
  { ip: "94.200.12.86", country: "United Arab Emirates", city: "Dubai", device: "Mobile", os: "Android", userAgent: "Android 12 Chrome Mobile", timestamp: new Date(Date.now() - 120 * 60 * 1000).toISOString() },
  { ip: "82.165.90.15", country: "United Kingdom", city: "London", device: "Desktop", os: "macOS", userAgent: "macOS Ventura Safari", timestamp: new Date(Date.now() - 180 * 60 * 1000).toISOString() },
  { ip: "39.52.48.109", country: "Pakistan", city: "Rawalpindi", device: "Mobile", os: "Android", userAgent: "Android 11 Chrome Mobile", timestamp: new Date(Date.now() - 240 * 60 * 1000).toISOString() },
  { ip: "119.155.62.14", country: "Pakistan", city: "Peshawar", device: "Desktop", os: "Windows", userAgent: "Windows 11 Edge", timestamp: new Date(Date.now() - 320 * 60 * 1000).toISOString() },
  { ip: "172.56.21.90", country: "United States", city: "New York", device: "Tablet", os: "iOS", userAgent: "iPad iOS 16 Safari", timestamp: new Date(Date.now() - 410 * 60 * 1000).toISOString() },
  { ip: "182.185.22.41", country: "Pakistan", city: "Faisalabad", device: "Mobile", os: "Android", userAgent: "Android 13 Chrome Mobile", timestamp: new Date(Date.now() - 500 * 60 * 1000).toISOString() },
  { ip: "39.45.19.82", country: "Pakistan", city: "Multan", device: "Mobile", os: "Android", userAgent: "Android 12 Chrome Mobile", timestamp: new Date(Date.now() - 620 * 60 * 1000).toISOString() }
];

app.post('/api/log-visit', (req, res) => {
  const { ip, country, city, device, os, userAgent, timestamp } = req.body;
  if (!country || !device) {
    return res.status(400).json({ error: "Missing required fields for visit logging" });
  }

  // Push new log to front
  visitorLogs.unshift({
    ip: ip || '127.0.0.1',
    country: country,
    city: city || 'Unknown City',
    device: device,
    os: os || 'Unknown OS',
    userAgent: userAgent ? userAgent.substring(0, 100) : 'Unknown Agent',
    timestamp: timestamp || new Date().toISOString()
  });

  // Limit to 500 logs
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
