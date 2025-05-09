import { TwitterApi } from 'twitter-api-v2';
import { Buffer } from 'buffer';

export default async function handler(req, res) {
  console.log(">>> /api/tweet invoked");

  if (req.method !== 'POST') return res.status(405).send('Only POST allowed');

  const { text, image_url, credentials } = req.body;

  if (!text || !image_url) return res.status(400).send('Missing text or image_url');

  const creds = credentials || {
    appKey: process.env.TWITTER_APP_KEY,
    appSecret: process.env.TWITTER_APP_SECRET,
    accessToken: process.env.TWITTER_ACCESS_TOKEN,
    accessSecret: process.env.TWITTER_ACCESS_SECRET,
  };

  console.log("Runtime Twitter Credentials Used:", {
    appKey: creds.appKey,
    appSecret: creds.appSecret,
    accessToken: creds.accessToken,
    accessSecret: creds.accessSecret
  });

  try {
    const twitterClient = new TwitterApi({
      appKey: creds.appKey,
      appSecret: creds.appSecret,
      accessToken: creds.accessToken,
      accessSecret: creds.accessSecret,
    });

    const rwClient = twitterClient.readWrite;

    const mediaData = await fetch(image_url).then(res => res.arrayBuffer());
    const mediaId = await rwClient.v1.uploadMedia(Buffer.from(mediaData), { mimeType: 'image/jpeg' });

    await rwClient.v2.tweet({ text, media: { media_ids: [mediaId] } });

    res.status(200).json({ success: true, message: 'Tweet posted!' });
  } catch (err) {
    console.error("Tweet Error:", err);
    res.status(500).json({ error: 'Failed to tweet', details: err.message });
  }
}
