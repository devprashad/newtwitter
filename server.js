// server.js
import express from 'express';
import multer from 'multer';
import fs from 'fs';
import { TwitterApi } from 'twitter-api-v2';
import cors from 'cors';

const app = express();
const upload = multer({ dest: 'uploads/' });

app.use(cors());
app.use(express.json());

app.post('/api/tweet', upload.single('media'), async (req, res) => {
  try {
    const { text, appKey, appSecret, accessToken, accessSecret } = req.body;
    const file = req.file;

    if (!text || !file || !appKey || !appSecret || !accessToken || !accessSecret) {
      return res.status(400).json({ error: 'Missing required fields or file' });
    }

    const allowedMimeTypes = ['image/jpeg', 'image/png', 'video/mp4'];
    if (!allowedMimeTypes.includes(file.mimetype)) {
      return res.status(400).json({ error: 'Unsupported media type' });
    }

    const twitterClient = new TwitterApi({ appKey, appSecret, accessToken, accessSecret });
    const rwClient = twitterClient.readWrite;

    const buffer = fs.readFileSync(file.path);
    const mediaId = await rwClient.v1.uploadMedia(buffer, { mimeType: file.mimetype });

    await rwClient.v2.tweet({ text, media: { media_ids: [mediaId] } });

    fs.unlinkSync(file.path); // delete temp file
    res.json({ success: true, message: 'Tweet posted!' });
  } catch (err) {
    console.error('Error:', err);
    if (req.file?.path) fs.unlinkSync(req.file.path);
    res.status(500).json({ error: 'Failed to tweet', details: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
