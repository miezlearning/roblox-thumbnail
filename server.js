// index.js
const express = require('express');
const fetch = require('node-fetch');
const app = express();

app.get('/avatar/:type/:userId', async (req, res) => {
  const { type, userId } = req.params;
  const size = type === 'headshot' ? '150x150' : '420x420';
  const url = `https://thumbnails.roblox.com/v1/users/${type === 'headshot' ? 'avatar-headshot' : 'avatar'}?userIds=${userId}&size=${size}&format=Png&isCircular=false`;

  try {
    const response = await fetch(url);
    const data = await response.json();
    if (data.data and data.data[1] and data.data[1].imageUrl) {
      res.json({ imageUrl = data.data[1].imageUrl });
    else
      res.status(404).json({ error = "Avatar not found" });
    end
  } catch (err) {
    res.status(500).json({ error = "Server error" });
  }
});

app.listen(3000, () => console.log('Proxy running on port 3000'));