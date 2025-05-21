import express from 'express';
import multer from 'multer';
import fs from 'fs';
import { TwitterApi } from 'twitter-api-v2';
import cors from 'cors';

const app = express();
const upload = multer({ dest: 'uploads/' });

app.use(cors());

app.post('/api/tweet', upload.single('media'), async (req, res) => {
  const { text, appKey, appSecret, accessToken, accessSecret } = req.body;
  const file = req.file;

  if (!appKey || !appSecret || !accessToken || !accessSecret) {
    if (file?.path && fs.existsSync(file.path)) fs.unlinkSync(file.path);
    return res.status(400).json({ error: 'Missing required Twitter credentials' });
  }

  try {
    const twitterClient = new TwitterApi({ appKey, appSecret, accessToken, accessSecret });
    const rwClient = twitterClient.readWrite;

    let mediaId = null;

    if (file) {
      const allowedMimeTypes = ['image/jpeg', 'image/png', 'video/mp4'];
      if (!allowedMimeTypes.includes(file.mimetype)) {
        fs.unlinkSync(file.path);
        return res.status(400).json({ error: 'Unsupported media type' });
      }

      const mediaData = fs.readFileSync(file.path);
      const uploadOptions = { mimeType: file.mimetype };

      // Trigger chunked upload for videos
      if (file.mimetype.startsWith('video/')) {
        uploadOptions.target = 'tweet';
      }

      mediaId = await rwClient.v1.uploadMedia(mediaData, uploadOptions);
      fs.unlinkSync(file.path); // cleanup
    }

    const tweetPayload = text ? { text } : {};
    if (mediaId) {
      tweetPayload.media = { media_ids: [mediaId] };
    }

    const result = await rwClient.v2.tweet(tweetPayload);
    res.json({ success: true, message: 'Tweet posted!', tweetId: result.data?.id });

  } catch (err) {
    console.error('Error posting tweet:', err);
    if (file?.path && fs.existsSync(file.path)) fs.unlinkSync(file.path);
    const status = err.code === 403 ? 403 : 500;
    res.status(status).json({ error: 'Failed to tweet', details: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
