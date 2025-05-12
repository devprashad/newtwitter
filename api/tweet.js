import { TwitterApi } from 'twitter-api-v2';
import multer from 'multer';
import fs from 'fs';
import path from 'path';

export const config = {
  api: {
    bodyParser: false, // Required for file uploads
  },
};

const upload = multer({ dest: '/tmp' });

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Only POST allowed' });
  }

  upload.single('media')(req, res, async (err) => {
    if (err) return res.status(500).json({ error: 'File upload failed' });

    const { text, appKey, appSecret, accessToken, accessSecret } = req.body;
    const file = req.file;

    if (!text || !file || !appKey || !appSecret || !accessToken || !accessSecret) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const twitterClient = new TwitterApi({
      appKey,
      appSecret,
      accessToken,
      accessSecret,
    });
    const rwClient = twitterClient.readWrite;

    const mediaData = fs.readFileSync(file.path);
    const mediaSize = mediaData.length;
    const mediaType = file.mimetype;

    try {
      // Step 1: INIT
      const initResponse = await rwClient.v1.mediaUploadInit({
        command: 'INIT',
        total_bytes: mediaSize,
        media_type: mediaType,
        media_category: 'tweet_video',
      });

      const mediaId = initResponse.media_id_string;

      // Step 2: APPEND chunks (5MB max)
      const chunkSize = 5 * 1024 * 1024;
      for (let i = 0; i < mediaSize; i += chunkSize) {
        const chunk = mediaData.slice(i, i + chunkSize);
        await rwClient.v1.mediaUploadAppend(mediaId, chunk, i / chunkSize);
      }

      // Step 3: FINALIZE
      await rwClient.v1.mediaUploadFinalize(mediaId);

      // Post tweet
      await rwClient.v2.tweet({
        text,
        media: { media_ids: [mediaId] },
      });

      fs.unlinkSync(file.path); // Clean up
      res.status(200).json({ success: true, message: 'Tweet posted with video!' });

    } catch (err) {
      console.error('Upload Error:', err);
      fs.unlinkSync(file.path);
      res.status(500).json({ error: 'Video upload failed', details: err.message });
    }
  });
}
