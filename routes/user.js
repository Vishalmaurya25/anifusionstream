const express = require('express');
const router = express.Router();
const User = require('../models/User');
const OTP = require('../models/OTP');
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');

// --- EMAIL CONFIGURATION ---
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

/**
 * Helper: Send Professional OTP Emails
 */
const sendOTPEmail = async (email, username, otp, type = 'registration') => {
    const isReset = type === 'reset';
    const subject = isReset 
        ? 'Reset Your AniFusionstream Password' 
        : 'Verify Your AniFusionstream Account';
    
    const actionText = isReset ? 'reset your password' : 'verify your Email Address for AniFusionstream registration';

    const mailOptions = {
        from: `"AniFusionstream" <${process.env.EMAIL_USER}>`,
        to: email,
        subject: subject,
        text: `Dear ${username},\n\nThe One Time Password (OTP) to ${actionText} is ${otp}. It will expire in 5 minutes. Please do not share this code with anyone.\n\nRegards,\nAniFusionstream Team`
    };

    return transporter.sendMail(mailOptions);
};

// --- ROUTES ---

/**
 * GET /register
 */
router.get('/register', (req, res) => {
    res.render('user-register', { 
        messages: req.flash('error'), 
        session: req.session 
    });
});

/**
 * POST /register
 */
router.post('/register', async (req, res) => {
    try {
        const { email, password, username } = req.body;

        // Validation logic
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            req.flash('error', 'Email already registered');
            return res.redirect('/user/register');
        }

        const existingUsername = await User.findOne({ username });
        if (existingUsername) {
            req.flash('error', 'Username already taken');
            return res.redirect('/user/register');
        }

        // OTP Generation
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        await OTP.create({ email, otp });

        // Send Email
        await sendOTPEmail(email, username, otp, 'registration');

        req.session.tempUser = { email, password, username };
        res.redirect('/user/verify-otp');

    } catch (error) {
        console.error('Registration Error:', error);
        req.flash('error', 'An error occurred during registration. Please try again.');
        res.redirect('/user/register');
    }
});

/**
 * GET /verify-otp
 */
router.get('/verify-otp', (req, res) => {
    if (!req.session.tempUser) {
        return res.redirect('/user/register');
    }
    res.render('user-verify-otp', { 
        messages: req.flash('error'), 
        session: req.session 
    });
});

/**
 * POST /verify-otp
 */
router.post('/verify-otp', async (req, res) => {
    try {
        const { otp } = req.body;
        const tempUser = req.session.tempUser;

        if (!tempUser) return res.redirect('/user/register');

        const otpRecord = await OTP.findOne({ email: tempUser.email, otp });
        if (!otpRecord) {
            req.flash('error', 'Invalid or expired OTP');
            return res.redirect('/user/verify-otp');
        }

        // Finalize User Creation
        const hashedPassword = await bcrypt.hash(tempUser.password, 10);
        const user = await User.create({ 
            email: tempUser.email, 
            password: hashedPassword, 
            username: tempUser.username 
        });

        // Cleanup
        delete req.session.tempUser;
        await OTP.deleteOne({ email: tempUser.email, otp });

        req.session.user = user;
        req.session.isUserAuthenticated = true;
        res.redirect('/user/login');

    } catch (error) {
        console.error('OTP Verification Error:', error);
        req.flash('error', 'Verification failed. Please try again.');
        res.redirect('/user/verify-otp');
    }
});

/**
 * GET /login
 */
router.get('/login', (req, res) => {
    res.render('user-login', { 
        messages: req.flash('error'), 
        session: req.session 
    });
});

/**
 * POST /login
 */
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email });

        if (!user || !(await bcrypt.compare(password, user.password))) {
            req.flash('error', 'Invalid credentials');
            return res.redirect('/user/login');
        }

        req.session.user = user;
        req.session.isUserAuthenticated = true;
        res.redirect('/');

    } catch (error) {
        console.error('Login Error:', error);
        req.flash('error', 'An error occurred during login.');
        res.redirect('/user/login');
    }
});

/**
 * GET /logout
 */
router.get('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) console.error('Logout Session Destroy Error:', err);
        res.redirect('/user/login');
    });
});

/**
 * GET /forgot-password
 */
router.get('/forgot-password', (req, res) => {
    res.render('user-forgot-password', { 
        messages: req.flash('error'), 
        session: req.session 
    });
});

/**
 * POST /forgot-password
 */
router.post('/forgot-password', async (req, res) => {
    try {
        const { email } = req.body;
        const user = await User.findOne({ email });

        if (!user) {
            req.flash('error', 'Email not found');
            return res.redirect('/user/forgot-password');
        }

        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        await OTP.create({ email, otp });

        await sendOTPEmail(email, user.username, otp, 'reset');

        req.session.resetEmail = email;
        res.redirect('/user/reset-password');

    } catch (error) {
        console.error('Forgot Password Error:', error);
        req.flash('error', 'Error sending reset OTP.');
        res.redirect('/user/forgot-password');
    }
});

/**
 * GET /reset-password
 */
router.get('/reset-password', (req, res) => {
    if (!req.session.resetEmail) {
        return res.redirect('/user/forgot-password');
    }
    res.render('user-reset-password', { 
        messages: req.flash('error'), 
        session: req.session 
    });
});

/**
 * POST /reset-password
 */
router.post('/reset-password', async (req, res) => {
    try {
        const { otp, newPassword } = req.body;
        const email = req.session.resetEmail;

        if (!email) return res.redirect('/user/forgot-password');

        const otpRecord = await OTP.findOne({ email, otp });
        if (!otpRecord) {
            req.flash('error', 'Invalid or expired OTP');
            return res.redirect('/user/reset-password');
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10);
        await User.findOneAndUpdate({ email }, { password: hashedPassword });

        // Cleanup
        delete req.session.resetEmail;
        await OTP.deleteOne({ email, otp });

        res.redirect('/user/login');

    } catch (error) {
        console.error('Reset Password Error:', error);
        req.flash('error', 'Could not reset password. Please try again.');
        res.redirect('/user/reset-password');
    }
});

module.exports = router;