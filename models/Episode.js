const mongoose = require('mongoose');

const episodeSchema = new mongoose.Schema({
  title: { type: String, required: true },
  videoUrl: { type: String, required: false },
  embedCode: { type: String, required: false },
  imageUrl: { type: String }, // <--- ADDED THIS FIELD
  episodeNumber: { type: Number, required: true },
  seasonNumber: { type: Number, required: true },
  anime: { type: mongoose.Schema.Types.ObjectId, ref: 'Anime' },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Episode', episodeSchema);