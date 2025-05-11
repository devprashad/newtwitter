import { TwitterApi } from 'twitter-api-v2';
import formidable from 'formidable';
import fs from 'fs';

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Only POST allowed');

  const form = new formidable.IncomingForm();

  form.parse(req, async (err, fields, files) => {
    if (err) {
      console.error('Form parsing error:', err);
      return res.status(500).json({ error: 'Form parse error' });
    }

    const { text, appKey, appSecret, accessToken, accessSecret } = fields;
    const file = files.media?.[0];

    if (!text || !file || !appKey || !appSecret || !accessToken || !accessSecret) {
      return res.status(400).json({ error: 'Missing required fields or file' });
    }

    try {
      const twitterClient = new TwitterApi({
        appKey,
        appSecret,
        accessToken,
        accessSecret,
      });

      const rwClient = twitterClient.readWrite;

      const buffer = fs.readFileSync(file.filepath);
      const mimeType = file.mimetype;

      const mediaId = await rwClient.v1.uploadMedia(buffer, { mimeType });

      await rwClient.v2.tweet({ text, media: { media_ids: [mediaId] } });

      res.status(200).json({ success: true, message: 'Tweet posted!' });
    } catch (err) {
      console.error('Tweet error:', err);
      res.status(500).json({ error: 'Failed to tweet', details: err.message });
    }
  });
}
