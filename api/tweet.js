import { TwitterApi } from 'twitter-api-v2';
import multer from 'multer';
import fs from 'fs';
import sleep from 'util-promisify-timeout'; // For polling

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

    if (!appKey || !appSecret || !accessToken || !accessSecret) {
      return res.status(400).json({ error: 'Missing Twitter credentials' });
    }

    const twitterClient = new TwitterApi({
      appKey,
      appSecret,
      accessToken,
      accessSecret,
    });

    const rwClient = twitterClient.readWrite;
    let mediaId;

    try {
      // === Upload media if present ===
      if (file) {
        const mediaData = fs.readFileSync(file.path);
        const mediaSize = mediaData.length;
        const mediaType = file.mimetype;

        // INIT
        const initResp = await rwClient.v1.mediaUploadInit({
          command: 'INIT',
          total_bytes: mediaSize,
          media_type: mediaType,
          media_category: 'tweet_video',
        });

        mediaId = initResp.media_id_string;

        // APPEND
        const chunkSize = 5 * 1024 * 1024;
        for (let i = 0; i < mediaSize; i += chunkSize) {
          const chunk = mediaData.slice(i, i + chunkSize);
          await rwClient.v1.mediaUploadAppend(mediaId, chunk, i / chunkSize);
        }

        // FINALIZE
        await rwClient.v1.mediaUploadFinalize(mediaId);

        // POLL
        let processingInfo;
        let attempts = 0;
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

        fs.unlinkSync(file.path);
      }

      // === Handle tweet ===
      if (text) {
        const tweetPayload = { text };
        if (mediaId) {
          tweetPayload.media = { media_ids: [mediaId] };
        }

        const tweet = await rwClient.v2.tweet(tweetPayload);
        return res.status(200).json({
          success: true,
          message: 'Tweet posted!',
          tweet_url: `https://twitter.com/user/status/${tweet.data.id}`,
        });
      }

      // === If only media uploaded ===
      if (mediaId && !text) {
        return res.status(200).json({
          success: true,
          message: 'Media uploaded successfully!',
          media_id: mediaId,
        });
      }

      return res.status(400).json({ error: 'Nothing to post (no text or media)' });

    } catch (error) {
      console.error('Error:', error);
      if (file && fs.existsSync(file.path)) fs.unlinkSync(file.path);
      return res.status(500).json({ error: 'Operation failed', details: error.message });
    }
  });
}
