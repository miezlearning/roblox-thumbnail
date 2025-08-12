const fetch = require('node-fetch');

module.exports = async (req, res) => {
  const { type, userId } = req.query;

  if (!userId || !type) {
    return res.status(400).json({ error: "Missing type or userId" });
  }

  const size = type === "headshot" ? "150x150" : "420x420";
  const endpoint = type === "headshot" ? "avatar-headshot" : "avatar";

  const url = `https://thumbnails.roblox.com/v1/users/${endpoint}?userIds=${userId}&size=${size}&format=Png&isCircular=false`;

  try {
    const response = await fetch(url);
    const data = await response.json();
    if (data.data && data.data[0] && data.data[0].imageUrl) {
      res.json({ imageUrl: data.data[0].imageUrl });
    } else {
      res.status(404).json({ error: "Avatar not found" });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
};