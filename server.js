import express from 'express';
import multer from 'multer';
import fs from 'fs';
import { TwitterApi } from 'twitter-api-v2';
import cors from 'cors';
import path from 'path';
import util from 'util';

const app = express();
const upload = multer({ dest: 'uploads/' });
const sleep = util.promisify(setTimeout);

app.use(cors());
app.use(express.json());

app.post('/api/tweet', upload.single('media'), async (req, res) => {
  const { text, appKey, appSecret, accessToken, accessSecret } = req.body;
  const file = req.file;

  if (!appKey || !appSecret || !accessToken || !accessSecret) {
    if (file) fs.unlinkSync(file.path);
    return res.status(400).json({ error: 'Missing Twitter credentials' });
  }

  const twitterClient = new TwitterApi({ appKey, appSecret, accessToken, accessSecret });
  const rwClient = twitterClient.readWrite;
  let mediaId;

  try {
    // === Upload media if provided ===
    if (file) {
      const allowedMimeTypes = ['image/jpeg', 'image/png', 'video/mp4'];
      if (!allowedMimeTypes.includes(file.mimetype)) {
        fs.unlinkSync(file.path);
        return res.status(400).json({ error: 'Unsupported media type' });
      }

      const mediaData = fs.readFileSync(file.path);
      const mediaSize = mediaData.length;

      if (file.mimetype.startsWith('video/')) {
        // === Async Chunked Video Upload ===
        const initResp = await rwClient.v1.mediaUploadInit({
          command: 'INIT',
          total_bytes: mediaSize,
          media_type: file.mimetype,
          media_category: 'tweet_video',
        });

        mediaId = initResp.media_id_string;

        const chunkSize = 5 * 1024 * 1024;
        for (let i = 0; i < mediaSize; i += chunkSize) {
          const chunk = mediaData.slice(i, i + chunkSize);
          await rwClient.v1.mediaUploadAppend(mediaId, chunk, i / chunkSize);
        }

        await rwClient.v1.mediaUploadFinalize(mediaId);

        // Poll for media processing
        let processingInfo, attempts = 0;
        do {
          const statusResp = await rwClient.v1.mediaInfo(mediaId);
          processingInfo = statusResp.processing_info;

          if (!processingInfo || processingInfo.state === 'succeeded') break;
          if (processingInfo.state === 'failed') {
            throw new Error(`Media processing failed: ${processingInfo.error.name}`);
          }

          const wait = processingInfo.check_after_secs || 5;
          await sleep(wait * 1000);
          attempts++;
        } while (attempts < 10);
      } else {
        // === Direct image upload ===
        mediaId = await rwClient.v1.uploadMedia(mediaData, { mimeType: file.mimetype });
      }

      fs.unlinkSync(file.path); // cleanup
    }

    // === Tweet if text is present ===
    if (text) {
      const payload = { text };
      if (mediaId) {
        payload.media = { media_ids: [mediaId] };
      }

      const tweet = await rwClient.v2.tweet(payload);
      return res.status(200).json({
        success: true,
        message: 'Tweet posted!',
        tweet_url: `https://twitter.com/user/status/${tweet.data.id}`,
      });
    }

    // === Only media uploaded ===
    if (mediaId) {
      return res.status(200).json({
        success: true,
        message: 'Media uploaded successfully!',
        media_id: mediaId,
      });
    }

    return res.status(400).json({ error: 'No media or text provided' });

  } catch (err) {
    console.error('Error:', err);
    if (file && fs.existsSync(file.path)) fs.unlinkSync(file.path);
    return res.status(500).json({ error: 'Failed to tweet/upload', details: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
