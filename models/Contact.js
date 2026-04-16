const mongoose = require('mongoose');

const ContactSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true },
    subject: { 
        type: String, 
        required: true,
        enum: ['Copyright Complaint', 'Anime Suggestion', 'Dead Link Report', 'Video Quality/Blur Issue', 'Other']
    },
    message: { type: String, required: true },
    isRead: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Contact', ContactSchema);