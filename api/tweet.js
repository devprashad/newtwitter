import { TwitterApi } from 'twitter-api-v2';
import multer from 'multer';
import fs from 'fs';

export const config = {
  api: {
    bodyParser: false, // Disable Vercel's default body parser for multipart forms
  },
};

// Configure multer to store files in /tmp (Vercel's writable directory)
const upload = multer({ dest: '/tmp' });

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Only POST allowed' });
  }

  // Use multer middleware to parse the form
  upload.single('media')(req, res, async (err) => {
    if (err) {
      console.error('Multer error:', err);
      return res.status(500).json({ error: 'Failed to parse form' });
    }

    try {
      // Extract fields and file
      const { text, appKey, appSecret, accessToken, accessSecret } = req.body;
      const file = req.file; // Multer stores the file in req.file

      // Validate inputs
      if (!text || !file || !appKey || !appSecret || !accessToken || !accessSecret) {
        return res.status(400).json({ error: 'Missing required fields or file' });
      }

      // Validate tweet length and media type
      if (text.length > 280) {
        return res.status(400).json({ error: 'Tweet text exceeds 280 characters' });
      }
      const allowedMimeTypes = ['image/jpeg', 'image/png', 'video/mp4'];
      if (!allowedMimeTypes.includes(file.mimetype)) {
        return res.status(400).json({ error: 'Unsupported media type' });
      }

      // Initialize Twitter client
      const twitterClient = new TwitterApi({
        appKey: appKey,
        appSecret: appSecret,
        accessToken: accessToken,
        accessSecret: accessSecret,
      });
      const rwClient = twitterClient.readWrite;

      // Read file buffer
      const buffer = fs.readFileSync(file.path);
      const mimeType = file.mimetype;

      // Upload media to Twitter
      const mediaId = await rwClient.v1.uploadMedia(buffer, { mimeType });

      // Post tweet with media
      await rwClient.v2.tweet({ text, media: { media_ids: [mediaId] } });

      // Clean up temporary file
      fs.unlinkSync(file.path);

      // Respond with success
      res.status(200).json({ success: true, message: 'Tweet posted!' });
    } catch (err) {
      console.error('Error:', err);
      // Clean up temporary file if it exists
      if (req.file?.path) {
        fs.unlinkSync(req.file.path);
      }
      res.status(500).json({ error: 'Failed to tweet', details: err.message });
    }
  });
}