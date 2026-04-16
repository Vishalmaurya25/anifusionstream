const express = require('express');
const router = express.Router();
const Anime = require('../models/Anime');
const Episode = require('../models/Episode');
const Comment = require('../models/Comment');
const { ensureAuthenticatedUser, ensureAuthenticatedAdmin } = require('../middleware/auth');
const mongoose = require('mongoose');

/**
 * GET /:id
 * View Anime Details - Optimized for Premium Performance
 */
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).render('error', { message: 'Invalid anime ID', session: req.session });
        }

        // Fetch Anime with full population
        const anime = await Anime.findById(id)
            .populate('genres')
            .populate({
                path: 'seasons.episodes',
                model: 'Episode'
            });

        if (!anime) {
            return res.status(404).render('error', { message: 'Anime not found', session: req.session });
        }

        // Fetch Comments and Replies in a cleaner structure
        const comments = await Comment.find({ anime: id, parentComment: null })
            .populate('user')
            .populate({
                path: 'replies',
                populate: { path: 'user' }
            });

        // Fetch 8 random anime for the "Suggested" section (Premium UX feature)
        const randomAnimes = await Anime.aggregate([
            { $match: { _id: { $ne: anime._id } } },
            { $sample: { size: 8 } }
        ]);

        res.render('anime-detail', { 
            anime, 
            comments, 
            session: req.session, 
            randomAnimes 
        });

    } catch (error) {
        console.error('Error viewing anime details:', error);
        res.status(500).render('error', { message: 'Internal Server Error', session: req.session });
    }
});

/**
 * POST /delete-episode/:animeId/:seasonId/:episodeId
 * Admin only: Episode Removal Logic
 */
router.post('/delete-episode/:animeId/:seasonId/:episodeId', ensureAuthenticatedAdmin, async (req, res) => {
    try {
        const { animeId, seasonId, episodeId } = req.params;

        if (![animeId, seasonId, episodeId].every(id => mongoose.Types.ObjectId.isValid(id))) {
            return res.status(400).render('error', { message: 'Invalid ID provided', session: req.session });
        }

        const anime = await Anime.findById(animeId);
        if (!anime) return res.status(404).render('error', { message: 'Anime not found', session: req.session });

        const season = anime.seasons.id(seasonId);
        if (!season) return res.status(404).render('error', { message: 'Season not found', session: req.session });

        // Filter out the deleted episode
        season.episodes = season.episodes.filter(ep => ep._id.toString() !== episodeId);
        await anime.save();

        res.redirect(`/anime/${animeId}`);
    } catch (error) {
        console.error('Error deleting episode:', error);
        res.status(500).render('error', { message: 'Error deleting episode', session: req.session });
    }
});

/**
 * GET /edit-episode/:animeId/:seasonId/:episodeId
 * Admin only: Load Episode Editor
 */
router.get('/edit-episode/:animeId/:seasonId/:episodeId', ensureAuthenticatedAdmin, async (req, res) => {
    try {
        const { animeId, seasonId, episodeId } = req.params;

        if (![animeId, seasonId, episodeId].every(id => mongoose.Types.ObjectId.isValid(id))) {
            return res.status(400).render('error', { message: 'Invalid ID', session: req.session });
        }

        const anime = await Anime.findById(animeId);
        const episode = await Episode.findById(episodeId);

        if (!anime || !episode) {
            return res.status(404).render('error', { message: 'Content not found', session: req.session });
        }

        const season = anime.seasons.id(seasonId);
        
        res.render('admin-edit-episode', { 
            anime, 
            season, 
            episode, 
            session: req.session, 
            messages: req.flash() 
        });
    } catch (error) {
        console.error('Error loading edit page:', error);
        res.redirect('back');
    }
});

/**
 * POST /edit-episode/:animeId/:seasonId/:episodeId
 * Admin only: Update Logic (Includes Season Migration)
 */
router.post('/edit-episode/:animeId/:seasonId/:episodeId', ensureAuthenticatedAdmin, async (req, res) => {
    const { animeId, seasonId, episodeId } = req.params;
    const { episodeNumber, title, videoUrl, embedCode, seasonNumber } = req.body;

    // 1. Validation Logic
    const episodeNum = Number(episodeNumber);
    const newSeasonNum = Number(seasonNumber);

    if (!episodeNumber || isNaN(episodeNum) || episodeNum <= 0 || !title?.trim() || isNaN(newSeasonNum)) {
        req.flash('error', 'Please provide valid episode details and season number.');
        return res.redirect(`/anime/edit-episode/${animeId}/${seasonId}/${episodeId}`);
    }

    try {
        // 2. Embed Code Generation (UX Improvement: fallback to standard iframe)
        let finalEmbedCode = embedCode?.trim() || '';
        if (videoUrl && !finalEmbedCode) {
            finalEmbedCode = `<iframe src="${videoUrl.trim()}" style="border:0;height:360px;width:640px;max-width:100%" allowFullScreen="true" allowtransparency allow="autoplay" scrolling="no" frameborder="0"></iframe>`;
        }

        // 3. Update Episode Document
        await Episode.findByIdAndUpdate(episodeId, {
            episodeNumber: episodeNum,
            title: title.trim(),
            videoUrl: videoUrl?.trim() || '',
            embedCode: finalEmbedCode,
            seasonNumber: newSeasonNum
        });

        // 4. Update Anime Season Association
        const anime = await Anime.findById(animeId);
        const oldSeason = anime.seasons.id(seasonId);

        if (oldSeason && oldSeason.seasonNumber !== newSeasonNum) {
            // Remove from old
            oldSeason.episodes = oldSeason.episodes.filter(eid => eid.toString() !== episodeId);
            
            // Find or create new season
            let newSeason = anime.seasons.find(s => s.seasonNumber === newSeasonNum);
            if (!newSeason) {
                newSeason = anime.seasons.create({ seasonNumber: newSeasonNum, episodes: [] });
                anime.seasons.push(newSeason);
            }
            
            if (!newSeason.episodes.some(eid => eid.toString() === episodeId)) {
                newSeason.episodes.push(episodeId);
            }
        } else if (oldSeason) {
            if (!oldSeason.episodes.some(eid => eid.toString() === episodeId)) {
                oldSeason.episodes.push(episodeId);
            }
        }

        // Cleanup empty seasons for a cleaner DB
        anime.seasons = anime.seasons.filter(s => s.episodes?.length > 0);
        await anime.save();

        req.flash('success', 'Episode updated successfully.');
        res.redirect(`/anime/${animeId}`);

    } catch (error) {
        console.error('Update Error:', error);
        req.flash('error', `Update failed: ${error.message}`);
        res.redirect(`/anime/edit-episode/${animeId}/${seasonId}/${episodeId}`);
    }
});

/**
 * POST /comment/:animeId
 * Standard User/Admin Comments
 */
router.post('/comment/:animeId', async (req, res) => {
    const { animeId } = req.params;
    const { content } = req.body;

    if (!content?.trim()) {
        req.flash('error', 'Comment content cannot be empty.');
        return res.redirect(`/anime/${animeId}`);
    }

    if (!req.session.user && !req.session.isAdminAuthenticated) {
        req.flash('error', 'Please log in to comment.');
        return res.redirect('/user/login');
    }

    try {
        const comment = new Comment({
            anime: animeId,
            user: req.session.user ? req.session.user._id : null,
            username: req.session.isAdminAuthenticated ? 'AnimeFusionStream' : (req.session.user?.username || 'Guest'),
            email: req.session.user?.email || '',
            isAdmin: !!req.session.isAdminAuthenticated,
            content: content.trim()
        });
        await comment.save();
        res.redirect(`/anime/${animeId}`);
    } catch (error) {
        req.flash('error', 'Error adding comment.');
        res.redirect(`/anime/${animeId}`);
    }
});

/**
 * POST /comment/reply/:animeId/:commentId
 */
router.post('/comment/reply/:animeId/:commentId', async (req, res) => {
    const { animeId, commentId } = req.params;
    const { content } = req.body;

    if (!content?.trim() || !req.session.user && !req.session.isAdminAuthenticated) {
        req.flash('error', 'Content required or not logged in.');
        return res.redirect(`/anime/${animeId}`);
    }

    try {
        const parentComment = await Comment.findById(commentId);
        if (!parentComment) return res.redirect(`/anime/${animeId}`);

        const reply = new Comment({
            anime: animeId,
            user: req.session.user ? req.session.user._id : null,
            username: req.session.isAdminAuthenticated ? 'AnimeFusionStream' : (req.session.user?.username || ''),
            email: req.session.user?.email || '',
            isAdmin: !!req.session.isAdminAuthenticated,
            content: content.trim(),
            parentComment: commentId
        });
        
        await reply.save();
        parentComment.replies.push(reply._id);
        await parentComment.save();

        res.redirect(`/anime/${animeId}`);
    } catch (error) {
        res.redirect(`/anime/${animeId}`);
    }
});

/**
 * POST /comment/delete/:animeId/:commentId
 * Logic for recursive deletion of nested replies
 */
router.post('/comment/delete/:animeId/:commentId', async (req, res) => {
    const { animeId, commentId } = req.params;

    try {
        const comment = await Comment.findById(commentId).populate('user');
        if (!comment) return res.redirect(`/anime/${animeId}`);

        const isAdmin = !!req.session.isAdminAuthenticated;
        const isOwner = req.session.user && comment.user && comment.user._id.toString() === req.session.user._id.toString();

        if (!isOwner && !isAdmin) {
            req.flash('error', 'Unauthorized action.');
            return res.redirect(`/anime/${animeId}`);
        }

        // Recursive deletion helper
        const recursiveDelete = async (cid) => {
            const replies = await Comment.find({ parentComment: cid });
            for (const reply of replies) {
                await recursiveDelete(reply._id);
                await Comment.findByIdAndDelete(reply._id);
            }
        };

        await recursiveDelete(commentId);

        // Remove reference from parent if it's a reply
        if (comment.parentComment) {
            await Comment.findByIdAndUpdate(comment.parentComment, {
                $pull: { replies: commentId }
            });
        }

        await Comment.findByIdAndDelete(commentId);
        res.redirect(`/anime/${animeId}`);
    } catch (error) {
        req.flash('error', 'Error deleting comment.');
        res.redirect(`/anime/${animeId}`);
    }
});

/**
 * GET /
 * Latest Episodes Feed - Redesigned with flatMap for Speed
 */
router.get('/', async (req, res) => {
    try {
        const animes = await Anime.find({})
            .populate('genres')
            .populate({
                path: 'seasons.episodes',
                model: 'Episode'
            })
            .lean(); // Lean for faster read-only performance

        // Optimized flattening of episodes
        const latestEpisodes = animes.flatMap(anime => 
            (anime.seasons || []).flatMap(season => 
                (season.episodes || [])
                    .filter(ep => ep.videoUrl || ep.embedCode)
                    .map(episode => ({
                        _id: episode._id,
                        title: episode.title,
                        episodeNumber: episode.episodeNumber,
                        seasonNumber: season.seasonNumber,
                        animeId: anime._id,
                        animeTitle: anime.title,
                        videoUrl: episode.videoUrl,
                        embedCode: episode.embedCode,
                        createdAt: episode.createdAt
                    }))
            )
        )
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .slice(0, 10);

        res.render('latest-episodes', { latestEpisodes, session: req.session });
    } catch (error) {
        console.error('Error fetching latest episodes:', error);
        res.status(500).render('error', { message: 'Error loading feed', session: req.session });
    }
});

module.exports = router;