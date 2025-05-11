import { TwitterApi } from 'twitter-api-v2';
import { parseMultipartFormData } from '@vercel/node';
import fs from 'fs';

export const config = {
  api: {
    bodyParser: false, // Disable Vercel's default body parser for multipart forms
  },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Only POST allowed' });
  }

  try {
    // Parse multipart form data
    const { fields, files } = await parseMultipartFormData(req);

    // Extract fields and file
    const { text, appKey, appSecret, accessToken, accessSecret } = fields;
    const file = files.media; // Single file expected with name="media"

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
      appKey,
      appSecret,
      accessToken,
      accessSecret,
    });
    const rwClient = twitterClient.readWrite;

    // Read file buffer
    const buffer = fs.readFileSync(file.filepath);
    const mimeType = file.mimetype;

    // Upload media to Twitter
    const mediaId = await rwClient.v1.uploadMedia(buffer, { mimeType });

    // Post tweet with media
    await rwClient.v2.tweet({ text, media: { media_ids: [mediaId] } });

    // Clean up temporary file
    fs.unlinkSync(file.filepath);

    // Respond with success
    res.status(200).json({ success: true, message: 'Tweet posted!' });
  } catch (err) {
    console.error('Error:', err);
    // Clean up temporary file if it exists
    if (files?.media?.filepath) {
      fs.unlinkSync(files.media.filepath);
    }
    res.status(500).json({ error: 'Failed to tweet', details: err.message });
  }
}