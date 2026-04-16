const express = require('express');
const router = express.Router();
const Contact = require('../models/Contact'); // Import the model

// DMCA Page
router.get('/dmca', (req, res) => {
    res.render('dmca', { session: req.session });
});

// Privacy Policy Page
router.get('/privacy-policy', (req, res) => {
    res.render('privacy-policy', { session: req.session });
});

// Disclaimer Page
router.get('/disclaimer', (req, res) => {
    res.render('disclaimer.ejs', { session: req.session });
});

// Contact Us Page - GET (View the form)
router.get('/contact-us', (req, res) => {
    res.render('contact-us', { 
        session: req.session,
        messages: req.flash() 
    });
});

// Contact Us Page - POST (Handle the form submission)
router.post('/contact-us', async (req, res) => {
    try {
        const { name, email, subject, message } = req.body;

        if (!name || !email || !subject || !message) {
            req.flash('error', 'Please fill in all fields.');
            return res.redirect('/contact-us');
        }

        await Contact.create({
            name: name.trim(),
            email: email.trim(),
            subject,
            message: message.trim()
        });

        req.flash('success', 'Message sent! Our team will review your report shortly.');
        res.redirect('/contact-us');
    } catch (err) {
        console.error('Contact Form Error:', err);
        req.flash('error', 'Could not send message. Please try again later.');
        res.redirect('/contact-us');
    }
});

module.exports = router;