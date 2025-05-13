import { TwitterApi } from 'twitter-api-v2';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import util from 'util';

const execPromise = util.promisify(exec);

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

    const inputPath = file.path;
    const outputPath = `/tmp/converted_${Date.now()}.mp4`;

    try {
      // Convert video to Twitter-compatible format using ffmpeg
      const ffmpegCmd = `ffmpeg -i "${inputPath}" -vf "scale=1280:-2" -c:v libx264 -profile:v high -level 4.0 -pix_fmt yuv420p -preset fast -b:v 2500k -c:a aac -b:a 128k -ar 44100 -movflags +faststart "${outputPath}"`;
      console.log('Running FFmpeg:', ffmpegCmd);
      await execPromise(ffmpegCmd);

      const mediaData = fs.readFileSync(outputPath);
      const mediaSize = mediaData.length;
      const mediaType = 'video/mp4';

      // INIT
      const initResponse = await rwClient.v1.mediaUploadInit({
        command: 'INIT',
        total_bytes: mediaSize,
        media_type: mediaType,
        media_category: 'tweet_video',
      });

      const mediaId = initResponse.media_id_string;

      // APPEND in chunks
      const chunkSize = 5 * 1024 * 1024;
      for (let i = 0; i < mediaSize; i += chunkSize) {
        const chunk = mediaData.slice(i, i + chunkSize);
        await rwClient.v1.mediaUploadAppend(mediaId, chunk, i / chunkSize);
      }

      // FINALIZE
      await rwClient.v1.mediaUploadFinalize(mediaId);

      // TWEET
      await rwClient.v2.tweet({
        text,
        media: { media_ids: [mediaId] },
      });

      fs.unlinkSync(file.path);
      fs.unlinkSync(outputPath);

      res.status(200).json({ success: true, message: 'Tweet posted with converted video!' });

    } catch (err) {
      console.error('Upload Error:', err);
      if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
      if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
      res.status(500).json({ error: 'Video upload failed', details: err.message });
    }
  });
}
