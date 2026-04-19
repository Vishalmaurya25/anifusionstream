const mongoose = require('mongoose');

const animeSchema = new mongoose.Schema({
  name: { type: String, required: true },
  imageUrl: { type: String },
  description: { type: String },
  specialInfo: { type: String, default: '' },
  genres: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Genre' }],
  seasons: [{
    seasonNumber: { type: Number, required: true },
    episodes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Episode' }]
  }]
});

module.exports = mongoose.model('Anime', animeSchema);