require('dotenv').config();
const express = require('express');
const nodemailer = require('nodemailer');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

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

// Local development static file serving wrapper
if (process.env.NODE_ENV !== 'production') {
  const path = require('path');
  // Serve static files from the parent root directory
  app.use(express.static(path.join(__dirname, '..')));
  
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'index.html'));
  });
}

// Start listener only when running locally (not in serverless environment)
if (process.env.NODE_ENV !== 'production' && require.main === module) {
  app.listen(PORT, () => {
    console.log(`==================================================`);
    console.log(`🚀 Local dev server running on port ${PORT}`);
    console.log(`🔒 APIs configured securely on local environment`);
    console.log(`==================================================`);
  });
}

module.exports = app;
