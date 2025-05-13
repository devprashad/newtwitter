import { TwitterApi } from 'twitter-api-v2';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import util from 'util';
import sleep from 'util-promisify-timeout'; // Custom wait helper

export const config = {
  api: {
    bodyParser: false,
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

    try {
      const mediaData = fs.readFileSync(file.path);
      const mediaSize = mediaData.length;
      const mediaType = file.mimetype;

      // Step 1: INIT
      const initResp = await rwClient.v1.mediaUploadInit({
        command: 'INIT',
        total_bytes: mediaSize,
        media_type: mediaType,
        media_category: 'tweet_video',
      });

      const mediaId = initResp.media_id_string;

      // Step 2: APPEND chunks
      const chunkSize = 5 * 1024 * 1024;
      for (let i = 0; i < mediaSize; i += chunkSize) {
        const chunk = mediaData.slice(i, i + chunkSize);
        await rwClient.v1.mediaUploadAppend(mediaId, chunk, i / chunkSize);
      }

      // Step 3: FINALIZE
      await rwClient.v1.mediaUploadFinalize(mediaId);

      // Step 4: Poll for processing status
      let processingInfo;
      let attempts = 0;

      do {
        const statusResp = await rwClient.v1.mediaInfo(mediaId);
        processingInfo = statusResp.processing_info;

        if (!processingInfo || processingInfo.state === 'succeeded') {
          break;
        }

        if (processingInfo.state === 'failed') {
          throw new Error(`Media processing failed: ${processingInfo.error.name}`);
        }

        const checkAfter = processingInfo.check_after_secs || 5;
        await sleep(checkAfter * 1000);
        attempts++;

      } while (attempts < 10);

      // Step 5: Post Tweet
      await rwClient.v2.tweet({
        text,
        media: { media_ids: [mediaId] },
      });

      fs.unlinkSync(file.path);
      return res.status(200).json({ success: true, message: 'Tweet posted with video!' });

    } catch (error) {
      console.error('Final Error:', error);
      if (file && fs.existsSync(file.path)) fs.unlinkSync(file.path);
      return res.status(500).json({ error: 'Tweet failed', details: error.message });
    }
  });
}
