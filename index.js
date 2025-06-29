// index.js

const express = require('express');
const app = express();
require('dotenv').config();
const { connectDB } = require('./db'); // DB connection helper

const PORT = process.env.PORT || 3000;

const mongoose = require('mongoose');

// Define your schema and model
const urlSchema = new mongoose.Schema({
  shortCode: { type: String, unique: true },
  longUrl: String,
  clicks: { type: Number, default: 0 },
  expiresAt: Date
});

const Url = mongoose.model('Url', urlSchema);

// Helper for base62 encoding
const chars = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
function encodeBase62(num) {
  let str = '';
  while (num > 0) {
    str = chars[num % 62] + str;
    num = Math.floor(num / 62);
  }
  return str || '0';
}

let counter = 1;

app.use(express.json());
app.use(express.static('public'));


// Routes

app.get('/', (req, res) => {
  res.send('Welcome to the URL Shortener!');
});

// Utility function to generate a random short code
function generateShortCode(length = 6) {
  const chars = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let code = '';
  for (let i = 0; i < length; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

app.post('/shorten', async (req, res) => {
  const { longUrl, expiresInDays } = req.body || {};

  if (!longUrl || typeof longUrl !== 'string' || longUrl.trim() === '') {
    return res.status(400).json({ error: "Missing or invalid 'longUrl'" });
  }

  try {
    new URL(longUrl);
  } catch {
    return res.status(400).json({ error: "Invalid URL format" });
  }

  if (expiresInDays !== undefined && (isNaN(expiresInDays) || expiresInDays < 1)) {
    return res.status(400).json({ error: "'expiresInDays' must be a positive number" });
  }

  try {
    // Check if this long URL already exists
    let existing = await Url.findOne({ longUrl });
    if (existing) {
      return res.json({
        shortUrl: `http://localhost:${PORT}/${existing.shortCode}`,
        message: "URL already shortened",
      });
    }

    // Generate a unique short code
    let shortCode;
    let isUnique = false;
    while (!isUnique) {
      shortCode = generateShortCode();
      const existingCode = await Url.findOne({ shortCode });
      if (!existingCode) isUnique = true;
    }

    const expiresAt = expiresInDays
      ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
      : undefined;

    const urlDoc = new Url({ shortCode, longUrl, expiresAt });
    await urlDoc.save();

    res.json({ shortUrl: `http://localhost:${PORT}/${shortCode}` });

  } catch (err) {
    console.error("Error in /shorten:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});


// Get all shortened URLs
app.get('/api/urls', async (req, res) => {
  try {
    const urls = await Url.find().sort({ _id: -1 }).limit(10); // latest 10
    res.json(urls);
  } catch (err) {
    console.error('Error fetching URLs:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/:code', async (req, res) => {
  const { code } = req.params;

  if (!code || !/^[a-zA-Z0-9]{1,10}$/.test(code)) {
    return res.status(400).send('Invalid short code format');
  }

  try {
    const urlDoc = await Url.findOne({ shortCode: code });

    if (!urlDoc) {
      return res.status(404).send('Short URL not found');
    }

    if (urlDoc.expiresAt && new Date() > urlDoc.expiresAt) {
      return res.status(410).send('This short URL has expired');
    }

    urlDoc.clicks += 1;
    await urlDoc.save();

    res.redirect(urlDoc.longUrl);
  } catch (err) {
    console.error('Error in redirect:', err);
    res.status(500).send('Internal server error');
  }
});

app.get('/stats/:code', async (req, res) => {
  const { code } = req.params;

  if (!code || !/^[a-zA-Z0-9]{1,10}$/.test(code)) {
    return res.status(400).json({ error: 'Invalid short code format' });
  }

  try {
    const urlDoc = await Url.findOne({ shortCode: code });

    if (!urlDoc) {
      return res.status(404).json({ error: 'Short URL not found' });
    }

    const isExpired = urlDoc.expiresAt && new Date() > urlDoc.expiresAt;

    res.json({
      shortCode: urlDoc.shortCode,
      longUrl: urlDoc.longUrl,
      clicks: urlDoc.clicks,
      expiresAt: urlDoc.expiresAt,
      expired: !!isExpired,
    });
  } catch (err) {
    console.error('Error in /stats:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE all URLs from DB
app.delete('/api/urls', async (req, res) => {
  try {
    await Url.deleteMany({});
    res.json({ message: 'All URLs cleared' });
  } catch (err) {
    console.error('Error clearing URLs:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});


// Only connect to DB and start server if run directly
if (require.main === module) {
  connectDB(process.env.MONGO_URI)
    .then(() => {
      app.listen(PORT, () => {
        console.log(`Server running at http://localhost:${PORT}`);
      });
    })
    .catch(err => {
      console.error('DB connection failed:', err);
    });
}

module.exports = app;
