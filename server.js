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

    if (!appKey || !appSecret || !accessToken || !accessSecret) {
      return res.status(400).json({ error: 'Missing required Twitter credentials' });
    }

    const twitterClient = new TwitterApi({ appKey, appSecret, accessToken, accessSecret });
    const rwClient = twitterClient.readWrite;

    let mediaId;

    if (file) {
      const allowedMimeTypes = ['image/jpeg', 'image/png', 'video/mp4'];
      if (!allowedMimeTypes.includes(file.mimetype)) {
        fs.unlinkSync(file.path);
        return res.status(400).json({ error: 'Unsupported media type' });
      }

      const mediaData = fs.readFileSync(file.path);

      // Use target: 'tweet' for video to trigger chunked upload
      const uploadOptions = {
        mimeType: file.mimetype,
      };

      if (file.mimetype.startsWith('video/')) {
        uploadOptions.target = 'tweet';
      }

      mediaId = await rwClient.v1.uploadMedia(mediaData, uploadOptions);

      fs.unlinkSync(file.path); // delete temp file after upload
    }

    const tweetPayload = { text };
    if (mediaId) {
      tweetPayload.media = { media_ids: [mediaId] };
    }

    await rwClient.v2.tweet(tweetPayload);

    res.json({ success: true, message: 'Tweet posted!' });

  } catch (err) {
    console.error('Error:', err);
    if (req.file?.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    res.status(500).json({ error: 'Failed to tweet', details: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
